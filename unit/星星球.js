/*
 * @Author: TonyJiangWJ
 * @Date: 2019-11-27 23:07:35
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2023-08-07 21:24:07
 * @Description: 星星球自动游玩
 */
importClass(java.util.concurrent.LinkedBlockingQueue)
importClass(java.util.concurrent.ThreadPoolExecutor)
importClass(java.util.concurrent.TimeUnit)
importClass(java.util.concurrent.ThreadFactory)
importClass(java.util.concurrent.Executors)

let { config } = require('../config.js')(runtime, this)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, this)
let commonFunctions = singletonRequire('CommonFunction')
let runningQueueDispatcher = singletonRequire('RunningQueueDispatcher')
let CanvasDrawer = require('../lib/CanvasDrawer.js')
let resourceMonitor = require('../lib/ResourceMonitor.js')(runtime, this)
let widgetUtils = singletonRequire('WidgetUtils')
let automator = singletonRequire('Automator')

// requestScreenCapture(false)

const WIDTH = config.device_width
const HEIGHT = config.device_height
let running = true
let pausing = false
let playing = false
let drawRegion = true
let ball_config = {
  ballColor: '#ff4e86ff',
  startReco : [200,config.device_height/5*3,config.device_width-300,config.device_height/4],
  hitReco : [200,config.device_height/3,config.device_width-300,config.device_height/4],
  reco: config.reco,
  threshold: 4,
  // 目标分数
  targetScore: config.starBallScore,
  // 运行超时时间 毫秒
  timeout: 240000
}

console.verbose('转换后的配置：' + JSON.stringify(ball_config))

function starBallPlayer () {
  this.floatyWindow = null
  this.floatyLock = null
  this.floatyInitCondition = null

  this.threadPool = null
  this.color = '#00ff00'
  this.drawText = {
    type: 'text',
    text: '',
    position: {
      x: parseInt(WIDTH / 2),
      y: parseInt(HEIGHT / 2)
    },
    color: this.color,
    textSize: 40,
  }
  this.initPool = function () {
    let ENGINE_ID = engines.myEngine().id
    this.threadPool = new ThreadPoolExecutor(4, 8, 60, TimeUnit.SECONDS, new LinkedBlockingQueue(1024), new ThreadFactory({
      newThread: function (runnable) {
        let thread = Executors.defaultThreadFactory().newThread(runnable)
        thread.setName(config.thread_name_prefix + ENGINE_ID + '-星星球-' + thread.getName())
        return thread
      }
    }))
    let self = this
    commonFunctions.registerOnEngineRemoved(function () {
      running = false
      if (self.threadPool !== null) {
        self.threadPool.shutdown()
        console.verbose('关闭线程池：{}', self.threadPool.awaitTermination(5, TimeUnit.SECONDS))
      }
    })
  }

  this.initLock = function () {
    this.floatyLock = threads.lock()
    this.floatyInitCondition = this.floatyLock.newCondition()
  }

  this.listenStop = function () {
    let _this = this
    threads.start(function () {
      sleep(1000)
      toastLog('即将开始可按音量上键关闭', true)
      events.observeKey()
      events.onceKeyDown('volume_up', function (event) {
        running = false
        runningQueueDispatcher.removeRunningTask()
        log('准备关闭线程')
        _this.destroyPool()
        resourceMonitor.releaseAll()
        engines.myEngine().forceStop()
        exit()
      })
    })
  }

  this.initFloaty = function () {
    let _this = this
    this.threadPool.execute(function () {
      sleep(500)
      _this.floatyLock.lock()
      _this.floatyWindow = floaty.rawWindow(
        <canvas id="canvas" layout_weight="1" />
      )
      _this.floatyWindow.setTouchable(false)
      ui.run(() => {
        _this.floatyWindow.setPosition(0, 0)
        _this.floatyWindow.setSize(config.device_width, config.device_height)
      })
      _this.floatyInitCondition.signalAll()
      _this.floatyLock.unlock()

      _this.floatyWindow.canvas.on("draw", function (canvas) {
        if (!drawRegion && !pausing) return
        
        canvas.drawColor(0xFFFFFF, android.graphics.PorterDuff.Mode.CLEAR)

        if (_this.drawer == null) {
          _this.drawer = new CanvasDrawer(canvas, null, config.bang_offset)
        }

        let toDrawList = _this.toDrawList
        if (toDrawList && toDrawList.length > 0) {
          toDrawList.forEach(drawInfo => {
            try {
              switch (drawInfo.type) {
                case 'rect':
                  _this.drawer.drawRectAndText(drawInfo.text, drawInfo.rect, drawInfo.color || '#00ff00')
                  break
                case 'circle':
                  _this.drawer.drawCircleAndText(drawInfo.text, drawInfo.circle, drawInfo.color || '#00ff00')
                  break
                case 'text':
                  _this.drawer.drawText(drawInfo.text, drawInfo.position, drawInfo.color || '#00ff00', drawInfo.textSize)
                  break
                default:
                  console.warn(['no match draw event for {}', drawInfo.type], true)
              }
            } catch (e) {
              errorInfo('执行异常' + e)
              commonFunction.printExceptionStack(e)
            }
          })
        }
      })
    })
  }

  this.getScore = function () {
    let score_id = 'game-score-text'
    let scoreContainer = idMatches(score_id).exists() ? idMatches(score_id).findOne(1000) : null
    if (scoreContainer) {
      let scoreVal = parseInt(scoreContainer.text())
      if (isFinite((scoreVal))) {
        return scoreVal
      }
    }
    return 0
  }

  this.setFloatyColor = function (colorStr) {
    if (colorStr && colorStr.match(/^#[\dabcdef]{6}$/)) {
      this.color = colorStr
    } else {
      console.error('颜色配置无效:' + colorStr)
    }
  }


  this.setRectangle = function (text, rectRegion, color) {
    this.drawRect = {
      type: 'rect',
      text: text,
      rect: rectRegion,
      color: color,
    }
    this.toDrawList = [this.drawRect, this.drawText, this.drawBall].filter(v => !!v)
  }

  this.setFloatyInfo = function (point, text) {
    this.drawText = {
      type: 'text',
      text: text || this.drawText.text || '',
      position: point || this.drawText.position || {
        x: parseInt(WIDTH / 2),
        y: parseInt(HEIGHT / 2)
      },
      color: this.color,
      textSize: this.drawText.textSize,
    }
    this.toDrawList = [this.drawRect, this.drawText, this.drawBall].filter(v => !!v)
  }


  this.showFloatyCountdown = function (point, content, count) {
    let showContent = '[' + count + ']' + content
    while (count-- > 0) {
      this.setFloatyInfo(point, showContent)
      showContent = '[' + count + ']' + content
      sleep(1000)
    }
  }

  this.playing = function (stopScore) {
    if (!requestScreenCapture(false)) {
      toastLog('获取截图权限失败，退出游戏')
      return
    }
    running = true
    stopScore = stopScore || 230
    let currentScore = 0
    let clickCount = 0
    let start = new Date().getTime()
    let self = this
    this.floatyLock.lock()
    if (this.floatyWindow === null) {
      this.floatyInitCondition.await()
    }
    this.floatyLock.unlock()
    let countdownLatch = new java.util.concurrent.CountDownLatch(1)
    this.threadPool.execute(function () {
      // 识别球并击打一次
      let findAndHitBall = function (reco) {
        let img = captureScreen()
        let findPoints = []
        let point = images.findColor(img, '#ff4e86ff', {
          region: reco,
          threshold: ball_config.threshold
        })
        // if (point) {
        //   findPoints.push(point)
        // }
        if (!point) {
          point = images.findColor(img, '#ffff4c4c', {
            region: reco,
            threshold: ball_config.threshold
          })
          // if(point) {
          //   findPoints.push(point)
          // }
        }
        // if (!point) {
          // point = images.findColor(img, '#ffffd84c', {
          //   region: ball_config.reco,
          //   threshold: ball_config.threshold
          // })
          // if(point) {
          //   findPoints.push(point)
          // }
        // }
        // let sumX = 0, sumY = 0;
        // findPoints.forEach(point => {
        //   sumX += point.x
        //   sumY += point.y
        // })
        // point = findPoints.length > 0 ? {
        //   x: sumX / findPoints.length + 30,
        //   y: sumY / findPoints.length + 50
        // } : null

        // debugInfo(['找到 {} 个色点', findPoints.length])
        if (point) {
          point.x = point.x + 30
          point.y = point.y + 50
          debugInfo(['击球坐标: {},{}', point.x, point.y])
          click(point.x, point.y)
          clickCount++
          self.drawBall = {
            type: 'rect',
            text: '球',
            rect: [point.x-20, point.y-20, 40, 40],
          }
          self.setFloatyInfo(point, null)
          return true
        }
      }
      playing = false
      self.setRectangle('发球区域', ball_config.startReco)
      while (currentScore < stopScore && running) {
        if (pausing) {
          debugInfo('暂停中')
          sleep(1000)
          playing = false
          self.setRectangle('发球区域', ball_config.startReco)
          continue
        }
        if (!playing||(drawRegion&&currentScore==0)) {
          //发球
          playing = findAndHitBall(ball_config.startReco) || playing
          if (playing&&currentScore!=0) {
            self.setRectangle('回球区域', ball_config.hitReco)
          }
        } else {
          findAndHitBall(ball_config.hitReco)
        }
        sleep(10)
      }
      countdownLatch.countDown()
    })

    this.threadPool.execute(function () {
      let lastScore = 0
      let doNothingCount = 0
      while (currentScore < stopScore && running) {
        currentScore = self.getScore()
        if (lastScore !== currentScore) {
          lastScore = currentScore
          self.setFloatyInfo(null, lastScore)
          doNothingCount = 0
        } else {
          if (doNothingCount++ == 50) {
            log('连续10秒未获得分数，停止显示击球区域')
            drawRegion = false
          } else if (doNothingCount > 150) {
            log('连续30秒未获得分数，退出游戏')
            running = false
          }
        }
        sleep(200)
      }
      drawRegion = true
      countdownLatch.countDown()
    })
    
    this.threadPool.execute(function () {
      while (currentScore < stopScore && running) {
        let restart = textContains('再来一局').findOne(2000)
        if (restart) {
          debugInfo('发现再来一局，暂停')
          pausing = true
          sleep(1000)
          currentScore = 0
          restart.click()
          sleep(1000)
          debugInfo('点击再来一局，取消暂停')
          pausing = false
        }
        sleep(1000)
      }
    })

    countdownLatch.await()

    toastLog('最终分数:' + currentScore + ' 点击了：' + clickCount + '次 总耗时：' + (new Date().getTime() - start) + 'ms')
    let point = {
      x: parseInt(WIDTH / 3),
      y: parseInt(HEIGHT / 3),
    }
    this.setFloatyColor('#ff0000')
    this.showFloatyCountdown(point, '运行结束, 最终得分：' + currentScore, 3)
    this.setFloatyInfo({
      x: parseInt(WIDTH / 2),
      y: point.y
    }, '再见')
    sleep(2000)
    if (currentScore < stopScore) {
        return false
    } else {
        return true
    }
  }

  this.setTimeoutExit = function () {
    setTimeout(function () {
      runningQueueDispatcher.removeRunningTask()
      exit()
    }, 240000)
  }


  this.startPlaying = function (targetScore) {
    this.initPool()
    this.initLock()
    // this.listenStop()
    this.initFloaty()
    // this.setTimeoutExit()
    let result = this.playing(targetScore || ball_config.targetScore)
    this.destroyPool()
    // runningQueueDispatcher.removeRunningTask()
    // exit()
    return result
  }

  this.destroyPool = function () {
    this.threadPool.shutdownNow()
    this.threadPool = null
    this.floatyWindow.close()
    this.floatyWindow = null
  }

  this.exec = function () {
    return this.startPlaying()
  }
}


if (!commonFunctions.checkAccessibilityService()) {
  try {
    auto.waitFor()
  } catch (e) {
    warnInfo('auto.waitFor()不可用')
    auto()
  }
}

module.exports = new starBallPlayer()

