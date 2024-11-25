
let { config } = require('../config.js')(runtime, this)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, this)

let _runningQueueDispatcher = singletonRequire('RunningQueueDispatcher')
let _commonFunctions = singletonRequire('CommonFunction')
let alipayUnlocker = singletonRequire('AlipayUnlocker')
let widgetUtils = singletonRequire('WidgetUtils')
let WarningFloaty = singletonRequire('WarningFloaty')
let { logInfo, errorInfo, warnInfo, debugInfo, infoLog } = singletonRequire('LogUtils')
let _FloatyInstance = singletonRequire('FloatyUtil')
let yoloTrainHelper = singletonRequire('YoloTrainHelper')
let YoloDetection = singletonRequire('YoloDetectionUtil')
_FloatyInstance.enableLog()
let fodderCollector = require('./FodderCollector.js')
let BaiduOcrUtil = require('../lib/BaiduOcrUtil.js')
let localOcr = require('../lib/LocalOcrUtil.js')
let automator = singletonRequire('Automator')
let contentDefine = {
  soft: {
    personal_home: '进入个人鸡儿页面',
    friend_home: '进入好友鸡儿页面',
  },
  hard: {
    personal_home: '进入个人小鸡页面',
    friend_home: '进入好友小鸡页面',
  }
}
const CONTENT = contentDefine[config.content_type || 'hard']
function getRegionCenter (region) {
  debugInfo(['转换region位置:{}', JSON.stringify(region)])
  return {
    x: region[0] + parseInt(region[2] / 2),
    y: region[1] + parseInt(region[3] / 2)
  }
}
function AntManorRunner () {
  
  this.isSleep = false

  this.setFloatyTextColor = function (colorStr) {
    _FloatyInstance.setFloatyTextColor(colorStr)
  }

  this.setFloatyInfo = function (position, text) {
    debugInfo(['设置悬浮窗位置: {} 内容: {}', JSON.stringify(position), text])
    _FloatyInstance.setFloatyInfo(position, text)
  }

  this.launchApp = function (reopen) {
    debugInfo(['尝试打开支付宝，参数: {}', JSON.stringify(reopen)])
    app.startActivity({
      action: 'VIEW',
      data: 'alipays://platformapi/startapp?appId=66666674',
      packageName: 'com.eg.android.AlipayGphone'
    })

    sleep(500)
    _FloatyInstance.setFloatyInfo({ x: config.device_width / 2, y: config.device_height / 2 }, "查找是否有'打开'对话框")
    let startTime = new Date().getTime()
    while (new Date().getTime() - startTime < 30000) {
      let confirm = widgetUtils.widgetGetOne(/^打开$/, 1000)
      if (confirm) {
        automator.clickRandom(confirm)
        sleep(1000)
      }
          
      if (openAlipayMultiLogin(reopen)) {
        return this.launchApp(true)
      }
    
      if (config.is_alipay_locked) {
        alipayUnlocker.unlockAlipay()
        sleep(1000)
      }
  
      if (this.waitForOwn(true)) {
        _FloatyInstance.setFloatyText('已进入蚂蚁庄园')
        return true
      }

      sleep(1000)
    }

    errorInfo('打开蚂蚁庄园失败')
    return false
  }

  this.waitFor = function (color, region, threshold, desc) {
    let img = null
    let findColor = null
    let timeoutCount = 20
    WarningFloaty.addRectangle('校验区域颜色：' + color, region, '#00ff00')
    do {
      sleep(400)
      img = _commonFunctions.checkCaptureScreenPermission()
      findColor = images.findColor(img, color, {
        region: region,
        threshold: threshold || config.color_offset || 4
      })
    } while (!findColor && timeoutCount-- > 0)
    WarningFloaty.clearAll()
    if (findColor) {
      yoloTrainHelper.saveImage(img, desc + '成功', desc)
    } else {
      yoloTrainHelper.saveImage(img, desc + '失败', desc)
    }
    return findColor
  }

  this.yoloWaitFor = function (desc, filter) {
    let img = null
    let timeoutCount = 5
    let result = []
    WarningFloaty.clearAll()
    do {
      sleep(400)
      img = _commonFunctions.checkCaptureScreenPermission()
      result = YoloDetection.forward(img, filter)
    } while (result.length <= 0 && timeoutCount-- > 0)
    if (result.length > 0) {
      let { x, y, width, height } = result[0]
      WarningFloaty.addRectangle('找到：' + desc, [x, y, width, height])
      yoloTrainHelper.saveImage(img, desc + '成功', desc)
    } else {
      yoloTrainHelper.saveImage(img, desc + '失败', desc)
    }
    return result.length > 0
  }

  this.yoloCheck = function (desc, filter, index) {
    let img = null
    let result = []
    let tryTime = 5
    if (!index) {
      index=0   
    }
    WarningFloaty.clearAll()
    debugInfo(['通过YOLO查找：{} props: {}', desc, JSON.stringify(filter)])
    do {
      sleep(400)
      img = _commonFunctions.captureScreen()
      result = YoloDetection.forward(img, filter)
    } while (result.length <= 0 && tryTime-- > 0)
    if (result.length > index) {
      let { x, y, width, height, label, confidence } = result[index]
      let left = x, top = y
      WarningFloaty.addRectangle('找到：' + desc, [left, top, width, height])
      debugInfo(['通过YOLO找到目标：{} label: {} confidence: {}', desc, label, confidence])
      if (confidence < 0.9) {
        yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), desc + 'yolo准确率低', 'low_predict')
      }
      return { x: left + width / 2, y: top + height / 2, width: width, height: height, left: left, top: top, label: label }
    } else {
      debugInfo(['未能通过YOLO找到：{}', desc])
    }
    return null
  }

  this.killAndRestart = function () {
    _commonFunctions.killCurrentApp()
    _commonFunctions.setUpAutoStart(1)
    if (config.auto_lock === true && unlocker.needRelock() === true) {
      sleep(1000)
      debugInfo('重新锁定屏幕')
      automator.lockScreen()
      unlocker.saveNeedRelock(true)
    }
    _runningQueueDispatcher.removeRunningTask()
    exit()
  }

  /**
   * 
   * @param {boolean} keepAlive 是否保持运行 而不是退出
   * @returns 
   */
  this.waitForOwn = function (keepAlive) {
    let findColor = false
    let limit = 2
    do {
      if (YoloDetection.enabled) {
        findColor = this.yoloWaitFor('领饲料', { confidence: 0.7, labelRegex: 'collect_food' })
      } else {
        findColor = this.waitFor(config.CHECK_APP_COLOR, config.CHECK_APP_REGION, null, '小鸡主界面')
      }
      if (findColor) {
        this.setFloatyInfo(null, CONTENT.personal_home + '成功')
        return true
      } else {
        this.setFloatyInfo(null, '检测失败，尝试OCR识别')
        if (this.checkByOcr([0, 0, config.device_width * 0.2, config.device_height / 2], '捐蛋反馈|开心飞起|小鸡乐园|小鸡日记')) {
          this.setFloatyInfo(null, CONTENT.personal_home + '成功')
          return true
        }
      }
    } while (limit-- > 0)
    this.setFloatyTextColor('#ff0000')
    this.setFloatyInfo(getRegionCenter(config.CHECK_APP_REGION), CONTENT.personal_home + '失败，检测超时 ' + (keepAlive ? '等待脚本执行后续判断' : ''))
    if (!keepAlive) {
      this.killAndRestart()
    }
    return false
  }


  this.waitForFriends = function () {
    let findColor = false
    if (YoloDetection.enabled) {
      findColor = this.yoloWaitFor('给Ta留言|召回', { confidence: 0.7, labelRegex: 'leave_msg|bring_back' })
    } else {
      findColor = this.waitFor(config.CHECK_FRIENDS_COLOR, config.CHECK_FRIENDS_REGION, null, '好友界面')
    }
    if (findColor) {
      this.setFloatyInfo(null, CONTENT.friend_home + '成功')
      return true
    } else {
      this.setFloatyInfo(null, '检测失败，尝试OCR识别')
      if (this.checkByOcr([0, 0, config.device_width * 0.2, config.device_height / 2], '给Ta留言')) {
        this.setFloatyInfo(null, CONTENT.friend_home + '成功')
        return true
      }
    }
    
    let img = _commonFunctions.captureScreen()
    if (!findColor) {
      yoloTrainHelper.saveImage(img, '进入好友界面失败', 'friend_home_failed')
      this.setFloatyTextColor('#ff0000')
      this.setFloatyInfo(null, CONTENT.friend_home + '失败，检测超时')
      this.killAndRestart()
    } else {
      yoloTrainHelper.saveImage(img, '进入好友界面成功', 'friend_home_success')
    }
    return false
  }

  this.waitForDismiss = function () {
    // TODO 训练关闭按钮，其实OCR也行
    let findColor = this.waitFor(config.DISMISS_COLOR, config.DISMISS_REGION, null, '关闭按钮')
    if (findColor) {
      this.setFloatyInfo(findColor, '找到了关闭按钮')
      click(findColor.x, findColor.y)
      return true
    } else {
      if (this.checkByOcr([0, config.device_height / 2, config.device_width, config.device_height / 2], '.*关闭.*')) {
        this.setFloatyInfo(null, '找到了关闭按钮')
        return true
      }
      this.setFloatyInfo(null, '没找到关闭按钮，奇了怪了')
    }
    return false
  }

  this.checkIsSleeping = function (notExit) {
    let now = new Date()
    let currentTime = {
      hour: now.getHours(),
      minute: now.getMinutes(),
    }
    this.isSleep = false
    if (currentTime.hour > 6 && currentTime.hour < 20) {
      // 晚上八点到早上6点检查是否睡觉中 其他时间跳过
      debugInfo(['当前时间{} 不在晚上八点和早上6点之间', currentTime.hour])
      return false
    }
    if (!localOcr.enabled) {
      warnInfo(['请至少安装mlkit-ocr插件或者修改版AutoJS获取本地OCR能力'])
      return false
    }
    let screen = _commonFunctions.checkCaptureScreenPermission()
    let sleepWidget = localOcr.recognizeWithBounds(screen, null, '睡觉中')
    if (sleepWidget && sleepWidget.length > 0) {
      this.isSleep = true
      let sleepBounds = sleepWidget[0].bounds
      yoloTrainHelper.saveImage(screen, '睡觉中', 'sleeping')
      debugInfo(['find text: {}', sleepWidget[0].label])
      this.setFloatyInfo({ x: sleepBounds.left, y: sleepBounds.top }, '小鸡睡觉中')
      sleep(1000)
      // 仅仅main.js时创建第二天的定时任务
      // if ((engines.myEngine().getSource() + '').endsWith('main.js')) {
      //   // 设置第二天早上六点05启动 计算间隔时间
      //   _commonFunctions.setUpAutoStart(
      //     6 * 60 + (currentTime.hour >= 20 ?
      //       // 晚上八点后 加上当天剩余时间（分）
      //       (24 - currentTime.hour) * 60 - currentTime.minute
      //       // 早上六点前 减去已经经过的时间（分）
      //       : -(currentTime.hour * 60 + currentTime.minute)) + 5
      //   )
      // }
      if (notExit) {
        return true
      } else {
        _commonFunctions.minimize()
        resourceMonitor.releaseAll()
        _runningQueueDispatcher.removeRunningTask()
        exit()
      }
    }
    return false
  }

  this.checkIsOut = function () {
    if (YoloDetection.enabled) {
      let signboard = this.yoloCheck('标牌', { confidence: 0.7, labelRegex: 'signboard' })
      if (signboard) {
        yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '小鸡外出', 'signboard')
        this.setFloatyInfo(signboard, '小鸡外出不在家')
        // 需要点击上半部分
        click(signboard.x, signboard.y - signboard.height / 2)
        sleep(1000)
        this.checkAndBringBack()
      }
    } else {
      WarningFloaty.addRectangle('校验是否外出', config.OUT_REGION)
      let img = _commonFunctions.checkCaptureScreenPermission()
      let findColor = images.findColor(img, config.OUT_COLOR, {
        region: config.OUT_REGION,
        threshold: config.color_offset
      })
      if (findColor) {
        yoloTrainHelper.saveImage(img, '小鸡外出', 'signboard')
        this.setFloatyInfo(findColor, '小鸡出去找吃的了')
        sleep(1000)
        this.setFloatyInfo(null, '点击去找小鸡')
        click(findColor.x, findColor.y)
        sleep(1000)
        this.checkAndBringBack()
      }
    }
  }

  this.yoloClickConfirm = function (recheckByColor) {
    let confirm = this.yoloCheck('确认或关闭', { confidence: 0.7, labelRegex: 'confirm_btn|close_btn' })
    if (confirm) {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '确认或关闭', 'confirm_btn')
      click(confirm.x, confirm.y)
      return true
    } else {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), 'yolo查找确认或关闭失败', 'confirm_btn_fail')
      if (recheckByColor) {
        warnInfo(['yolo识别关闭按钮失败，降级为图色识别'])
        return this.waitForDismiss()
      } else {
        warnInfo(['yolo识别关闭按钮失败'])
      }
    }
    return false
  }

  this.checkAndBringBack = function () {
    let isBringBack = false

    //检查是否被带去除草
    let removeGrassTag = widgetUtils.widgetGetOne('除草中', 2000)
    if (removeGrassTag) {
      LogFloaty.pushLog('小鸡被带去除草了')
      let callBackBtn = removeGrassTag.parent().children().findOne(className("Button"))
      if (callBackBtn) {
        automator.clickRandom(callBackBtn)
        sleep(1000)
        automator.back()
        sleep(1000)
        isBringBack = true
      }
    } else {
      //到朋友家带回小鸡
      this.waitForFriends()
      WarningFloaty.clearAll()

      let screen = _commonFunctions.checkCaptureScreenPermission()
      if (screen) {
        let result = localOcr.recognizeWithBounds(screen, [0, config.device_height / 2, config.device_width, config.device_height / 2], '你的小鸡')
        if (result && result.length > 0) {
          let bounds = result[0].bounds
          LogFloaty.pushLog('你的小鸡位置：' + JSON.stringify({ x: bounds.centerX(), y: bounds.centerY() }))
          automator.clickPointRandom(bounds.centerX(), bounds.centerY()+200)
          isBringBack = true
          sleep(1000)
    
          let isWorking = widgetUtils.widgetGetOne('小鸡工作中.*', 1000)
          if (isWorking) {
            _FloatyInstance.setFloatyText('小鸡工作中，寻找确认按钮')
            let confirmBtn = widgetUtils.widgetGetOne('确认')
            if (confirmBtn) {
              this.setFloatyInfo({ x: confirmBtn.bounds().left, y: confirmBtn.bounds().top }, '确认按钮')
              automator.clickRandom(confirmBtn)
              sleep(1000)
            } else {
              _FloatyInstance.setFloatyText('未找到确认按钮')
              errorInfo('未找到确认按钮，请手动执行', true)
              isBringBack = false
            }
          }
        }
      }
    }
    if (!isBringBack) {
      automator.back()
    }

    sleep(1000)
    this.waitForOwn()
  }

  this.checkIfChikenOut = function () {
    let outBtn = widgetUtils.widgetGetOne('找小鸡', 2000)
    if (outBtn) {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '小鸡外出了', 'chick_out')
      automator.clickRandom(outBtn)
      sleep(8000)
      this.checkAndBringBack()
      return true
    }
    return false
  }

  this.checkThiefLeft = function () {
    WarningFloaty.addRectangle('左侧小偷鸡检测区域', config.LEFT_THIEF_REGION, '#00ff00')
    sleep(500)
    let img = _commonFunctions.checkCaptureScreenPermission()
    let findColor = images.findColor(img, config.THIEF_COLOR, {
      region: config.LEFT_THIEF_REGION,
      threshold: config.color_offset
    })
    if (findColor) {
      yoloTrainHelper.saveImage(img, '左侧有小鸡', 'thief_chicken')
      this.setFloatyInfo(findColor, '找到了左边的小透鸡')
      sleep(1000)
      this.setFloatyTextColor('#f35458')
      this.setFloatyInfo(null, '点击小透鸡')

      let punch = null
      let count = 3
      do {
        click(findColor.x, findColor.y)
        sleep(1500)
        img = _commonFunctions.checkCaptureScreenPermission()
        WarningFloaty.addRectangle('左侧小偷鸡拳头', config.LEFT_PUNCH_REGION, '#00ff00')
        punch = images.findColor(img, config.PUNCH_COLOR, {
          region: config.LEFT_PUNCH_REGION,
          threshold: config.color_offset
        })
      } while (!punch && count-- > 0)

      if (punch) {
        this.setFloatyTextColor(config.PUNCH_COLOR)
        this.setFloatyInfo(punch, '找到了左边的小拳拳')
        yoloTrainHelper.saveImage(img, '左侧小鸡带拳头', 'thief_chicken')
        sleep(2000)
        this.setFloatyInfo(null, '点击揍小鸡')
        click(punch.x, punch.y)
        sleep(1000)
        this.waitForDismiss()
        this.waitForOwn()
        sleep(1000)
        return true
      }
    } else {
      this.setFloatyInfo(getRegionCenter(config.LEFT_THIEF_REGION), '左边没野鸡')
      yoloTrainHelper.saveImage(img, '左侧无小鸡', 'no_thief_chicken')
    }
  }

  this.checkThiefRight = function () {
    WarningFloaty.addRectangle('右侧小偷鸡检测区域', config.RIGHT_THIEF_REGION, '#00ff00')
    sleep(500)
    let img = _commonFunctions.checkCaptureScreenPermission()
    let findColor = images.findColor(img, config.THIEF_COLOR, {
      region: config.RIGHT_THIEF_REGION,
      threshold: config.color_offset
    })
    if (findColor) {
      this.setFloatyInfo(findColor, '找到了右边的小透鸡')
      sleep(1000)
      this.setFloatyTextColor('#f35458')
      this.setFloatyInfo(null, '点击小透鸡')

      let punch = null
      let count = 3
      do {
        click(findColor.x, findColor.y)
        WarningFloaty.addRectangle('右侧小偷鸡拳头', config.RIGHT_THIEF_REGION, '#00ff00')
        sleep(1500)
        img = _commonFunctions.checkCaptureScreenPermission()
        punch = images.findColor(img, config.PUNCH_COLOR, {
          region: config.RIGHT_PUNCH_REGION,
          threshold: config.color_offset
        })
      } while (!punch && count-- > 0)

      if (punch) {
        this.setFloatyTextColor(config.PUNCH_COLOR)
        this.setFloatyInfo(punch, '找到了右边的小拳拳')
        yoloTrainHelper.saveImage(img, '右侧小鸡带拳头', 'thief_chicken')
        sleep(2000)
        this.setFloatyInfo(null, '点击揍小鸡')
        click(punch.x, punch.y)
        sleep(1000)
        this.waitForDismiss()
        this.waitForOwn()
        sleep(1000)
        return true
      }
    } else {
      this.setFloatyInfo(getRegionCenter(config.RIGHT_THIEF_REGION), '右边没野鸡')
      yoloTrainHelper.saveImage(img, '左侧无小鸡', 'no_thief_chicken')
    }
  }

  this.checkAndFeed = function () {
    sleep(500)
    this.setFloatyInfo(null, '检查是否有饭吃')
    let feed = this.doFeed()
    // 记录是否执行了喂食操作
    if (feed) {
      if (this.checkIfChikenOut()) {
        return this.checkAndFeed()
      }
      this.checkFeedSuccess()
      // 避免加速卡使用失败导致时间计算不正确的问题
      _commonFunctions.updateSleepTime(20, true)
      if (config.useSpeedCard) {
        this.useSpeedCard()
      }
    }
    sleep(1500)
    let ocrRestTime = this.recognizeCountdownByOcr()
    if (feed) {
      // 刚刚喂食，且成功识别OCR，将当前时间设置为执行倒计时
      _commonFunctions.updateSleepTime(20, false, ocrRestTime)
    } else if (ocrRestTime > -1) {
      // 大概情况就是上一次执行喂食后加速卡用完了 导致OCR识别失败 以上机制懒得修改了 先这么适配
      let feedPassedTime = _commonFunctions.getFeedPassedTime()
      if (feedPassedTime < 20 && _commonFunctions.getSleepStorage().runningCycleTime < 0) {
        _commonFunctions.updateSleepTime(20 - feedPassedTime, false, ocrRestTime + feedPassedTime)
      }
    }
    let sleepTime = _commonFunctions.getSleepTimeByOcr(ocrRestTime)
    this.setFloatyInfo(null, sleepTime + '分钟后来检查状况')
    _commonFunctions.setUpAutoStart(sleepTime)
  }

  this.doFeed = function () {
    let img = null
    let feed = false
    if (YoloDetection.enabled) {
      let checkHasOrNoFood = this.yoloCheck('校验有饭吃', { confidence: 0.7, labelRegex: 'has_food|no_food' })
      img = _commonFunctions.checkCaptureScreenPermission()
      if (checkHasOrNoFood && checkHasOrNoFood.label == 'has_food') {
        config.COUNT_DOWN_REGION = [checkHasOrNoFood.left, checkHasOrNoFood.top - 100, checkHasOrNoFood.width + 30, 100]
        yoloTrainHelper.saveImage(img, '小鸡有饭吃', 'eating_chicken')
        this.setFloatyInfo(checkHasOrNoFood, '小鸡有饭吃哦')
      } else {
        yoloTrainHelper.saveImage(img, '小鸡没饭吃', 'hungry_chicken')
        _FloatyInstance.setFloatyText('小鸡没饭吃')
        let feedBtn = this.yoloCheck('喂饭按钮', { confidence: 0.7, labelRegex: 'feed_btn' })
        if (feedBtn) {
          //OCR检查是否有特殊食物
          let foodDesc = this.checkByOcr([feedBtn.left,feedBtn.top,feedBtn.width,feedBtn.height], '^\\d+g$', 1)
          if (!foodDesc) {
            let clickPoint = [feedBtn.x, feedBtn.top - 20]
            automator.clickPointRandom(clickPoint[0], clickPoint[1])
            sleep(2000)
            foodDesc = this.checkByOcr([feedBtn.left,config.device_height/2,feedBtn.width,feedBtn.top-config.device_height/2], '^\\d+g$')
          }
          // 执行喂饭
          if (foodDesc) {
            debugInfo(['点击喂饭按钮：[{}, {}]',foodDesc.bounds.centerX(),foodDesc.bounds.centerY()])
            automator.clickPointRandom(foodDesc.bounds.centerX(), foodDesc.bounds.centerY()-10)
            sleep(2000)
          } else {
            // click(feedBtn.x, feedBtn.y)
          }
          feed = true
        } else {
          _FloatyInstance.setFloatyText('未找到喂饭按钮')
        }
      }
    } else {
      WarningFloaty.addRectangle('校验是否有饭吃', config.FOOD_REGION, '#00ff00')
      img = _commonFunctions.checkCaptureScreenPermission()
      if (img) {
        let findColor = images.findColor(img, config.FOOD_COLOR, {
          region: config.FOOD_REGION,
          threshold: config.color_offset || 4
        })
        if (findColor) {
          this.setFloatyInfo(findColor, '小鸡有饭吃哦')
          yoloTrainHelper.saveImage(img, '小鸡有饭吃', 'eating_chicken')
        } else {
          this.setFloatyTextColor('#ff0000')
          this.setFloatyInfo({ x: config.FOOD_REGION[0], y: config.FOOD_REGION[1] }, '小鸡没饭吃呢')
          yoloTrainHelper.saveImage(img, '小鸡没饭吃', 'hungry_chicken')
          click(config.FEED_POSITION.x, config.FEED_POSITION.y)
          sleep(2000)
          feed = true
        }
      } else {
        this.setFloatyTextColor('#ff0000')
        this.setFloatyInfo(null, '截图失败了！')
      }
    }
    return feed
  }

  /**
   * 校验是否喂食成功，因为可能存在特殊饲料，吃完还能再吃，喂食失败后重试
   *
   * @param {*} retryTime 
   * @returns 
   */
  this.checkFeedSuccess = function (retryTime) {
    retryTime = retryTime || 0
    // 应该不会攒那么多特殊饲料吧
    if (retryTime >= 5) {
      return false
    }
    if (this.doFeed()) {
      sleep(1000)
      return this.checkFeedSuccess(retryTime++)
    }
  }

  /**
   * 使用加速卡
   */
  this.useSpeedCard = function () {
    if (YoloDetection.enabled) {
      let item = this.yoloCheck('使用道具', { labelRegex: 'item' })
      if (item) {
        click(item.x, item.y)
        sleep(1000)
      }
    } else {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '准备点击道具', 'item')
      click(config.TOOL_POSITION.x, config.TOOL_POSITION.y)
      sleep(1000)
    }
    let speedupCard = widgetUtils.widgetGetOne('加速卡')
    if (speedupCard) {
      automator.clickRandom(speedupCard)
      sleep(1000)
      let confirmUsing = widgetUtils.widgetGetOne('立即加速')
      if (!confirmUsing) {
        warnInfo(['未找到使用按钮，可能是加速卡用完了'])
      } else {
        automator.clickRandom(confirmUsing)
      }
      sleep(1000)
      automator.back()
    }
    if (!this.waitForOwn(true)) {
      warnInfo(['校验失败，重新打开个人界面'])
      this.launchApp(true)
    }
  }

  /**
   * @deprecated 当前加速卡可以无限使用，校验是否在加速中没有意义了
   * @returns 
   */
  this.checkSpeedSuccess = function () {
    return this.checker.checkSpeedSuccess()
  }

  this.checkAndPickShit = function () {
    let pickedShit = this.checker.checkAndClickShit()
    // todo 执行捡屎 训练
    if (pickedShit) {
      this.checker.checkAndCollectMuck()
      //关闭小鸡肥料厂
      let title = widgetUtils.widgetGetOne('小鸡肥料厂')
      if (title) {
        title = title.parent().child(title.indexInParent()-1)
        automator.clickRandom(title)
      }
    } else {
      this.setFloatyInfo(null, "没有屎可以捡")
      yoloTrainHelper.saveImage(_commonFunctions.checkCaptureScreenPermission(), '没有屎可以捡', 'pick_shit')
    }
  }

  //抽奖一次并返回奖品信息
  this.luckyDraw = function () {
    debugInfo('抽抽乐 抽奖一次')  
    let clickBtn = widgetUtils.widgetGetOne('还剩\\d+次机会',2000)
    if (clickBtn) {
      let drawTimes = new RegExp('还剩(\\d+)次机会').exec(clickBtn.text())[1]
      if (drawTimes > 0) {
        debugInfo('抽奖还有' + drawTimes + '次机会')
      } else {
        debugInfo('抽奖机会用完啦')
        return
      }
      automator.clickRandom(clickBtn)
      debugInfo('抽抽乐 等待抽奖结束')
      sleep(3000)
      debugInfo('开始识别抽奖结果')
      let luckyItem= widgetUtils.widgetGetOne('.*\\(\\d+.*\\)',2000)
      let luckyResult = null
      if (luckyItem) {
        luckyResult = new RegExp('(.*)\\((\\d+)(.*)\\)').exec(luckyItem.text())
        debugInfo(['抽抽乐 获得：{} {} {}',luckyResult[1], luckyResult[2], luckyResult[3]])
        luckyResult[0] = drawTimes - 1
      }
      automator.clickRandom(widgetUtils.widgetGetOne('知道啦',2000))
      sleep(1000)
      return luckyResult
    }
  }
  
  this.doFamily = function () {
    //OCR检查“家庭”并点击
    let familyBtn = this.checkByOcr([0,config.device_height/4*3,config.device_width,config.device_height/4],'^家庭$')
    if (familyBtn) {
      _FloatyInstance.setFloatyText('点击家庭')
      automator.clickPointRandom(familyBtn.bounds.centerX(), familyBtn.bounds.centerY()-20)
      sleep(6000)
    } else {
      return
    }

    let now = new Date()
    let hour = now.getHours()

    //6:00-10:00道早安
    let isMorning = hour >= 6 && hour < 10
    if (isMorning) {
      let morningBtn = this.checkByOcr([0,config.device_height/3,config.device_width,config.device_height/2],'^道早安$',1)
      if (morningBtn) {
        _FloatyInstance.setFloatyText('发现早安按钮, 道早安')
        automator.clickPointRandom(morningBtn.bounds.centerX(), morningBtn.bounds.centerY())
        sleep(1000)
        let confirmBtn = widgetUtils.widgetGetOne('确认发送',2000)
        if (confirmBtn) {
          automator.clickRandom(confirmBtn)
          sleep(1000)

         let closeBtn = widgetUtils.widgetGetOne('复制口令邀请.*',2000)
         closeBtn = closeBtn? (closeBtn.parent()? closeBtn.parent().parent().child(2):null) : null
         if (closeBtn) {
            automator.clickRandom(closeBtn)
            sleep(1000)
          }
        }
      }
    }
    //6:00-10:00、11:00-15:00、16:00-20:00 之间请客
    let isEatTime = hour >= 6 && hour < 10 || hour >= 11 && hour < 15 || hour >= 16 && hour < 20
    if (isEatTime) {
      let eatBtn = this.checkByOcr([0,config.device_height/3,config.device_width,config.device_height/2],'^去请客$',1)
      if (eatBtn) {
        _FloatyInstance.setFloatyText('发现请客按钮，请客吃饭')
        eatClickPoint = [config.device_width/2,eatBtn.bounds.bottom+100]
        automator.clickPointRandom(eatClickPoint[0], eatClickPoint[1])
        sleep(1000)
        let luckyBtn = widgetUtils.widgetGetOne('.*抽奖得美食',2000)
        if (luckyBtn) {
          let foodItems = widgetUtils.widgetGetAll('.*美食不足.*',2000)
          let needFoodNum = foodItems? foodItems.length:0
          debugInfo('美食不足，需要' + needFoodNum + '个')

          //进入抽奖界面
          automator.clickRandom(luckyBtn)
          sleep(2000)
          //抽奖直到满足需求
          while (needFoodNum > 0) {
            // 抽奖一次
            drawResult = this.luckyDraw()
            let drawTimes = drawResult? drawResult[0]:0
            let luckyItemNum = drawResult? drawResult[2]:0
            let luckyItemType = drawResult? drawResult[3]:''
            if (luckyItemType=='份') {
              needFoodNum -= luckyItemNum
              debugInfo('还需' + needFoodNum + '个美食')
            }
            if (drawTimes <= 0) {
              debugInfo('抽奖机会用完啦')
              break
            }
          }
          // 返回家庭界面
          automator.back()
          sleep(2000)
          
          //关闭并重新打开请客界面
          luckyBtn = widgetUtils.widgetGetOne('.*抽奖得美食',2000)
          if (luckyBtn) {
            let closeBtn = luckyBtn.parent()? luckyBtn.parent().child(luckyBtn.indexInParent()+1):null
            if (closeBtn) {
              automator.clickRandom(closeBtn)
              sleep(1000)
            }
            //如果食物已足够，则再次打开请客界面
            if (needFoodNum <= 0) {
              automator.clickPointRandom(eatClickPoint[0], eatClickPoint[1])
              sleep(1000)
            }
          }
        }
          
        let confirmBtn = widgetUtils.widgetGetOne('^确认$',2000)
        if (confirmBtn) {
          automator.clickRandom(confirmBtn)
          sleep(1000)
        }
      }
    }

    //帮喂饭
    // let feedBtn = this.checkByOcr([0,config.device_height/3,config.device_width,config.device_height/2],'^去喂食$',1)
    // if (feedBtn) {
    //   _FloatyInstance.setFloatyText('发现喂食按钮，帮喂食')
    //   automator.clickPointRandom(feedBtn.bounds.centerX(), feedBtn.bounds.centerY())
    //   sleep(1000)
    //   let confirmBtn = widgetUtils.widgetGetOne('^确认.*$',2000)
    //   if (confirmBtn) {
    //     automator.clickRandom(confirmBtn)
    //     sleep(1000)
    //   }
    // }
    
    //OCR检查“立即签到”并点击
    let signBtn = this.checkByOcr([0,config.device_height/4*3,config.device_width,config.device_height/4],'^立即签到$',1)
    if (signBtn) {
      _FloatyInstance.setFloatyText('发现签到按钮，进行签到')
      automator.clickPointRandom(signBtn.bounds.centerX(), signBtn.bounds.centerY())
      sleep(1000)
    }

    //返回主界面
    automator.back()
    sleep(2000)
  }

  this.recognizeCountdownByOcr = function () {
    let region = config.COUNT_DOWN_REGION
    if (YoloDetection.enabled) {
      let checkRegion = this.yoloCheck('倒计时区域', { confidence: 0.7, labelRegex: 'countdown' })
      if (checkRegion) {
        region = [checkRegion.left, checkRegion.top, checkRegion.width, checkRegion.height]
        debugInfo(['yolo识别ocr region:{}', JSON.stringify(region)])
      }
    }
    WarningFloaty.addRectangle('OCR识别倒计时区域', config.COUNT_DOWN_REGION)
    debugInfo(['region:{}', JSON.stringify(region)])
    let img = _commonFunctions.checkCaptureScreenPermission()
    img = images.clip(img, region[0], region[1], region[2], region[3])
    img = images.interval(images.grayscale(img), '#FFFFFF', 50)
    let result = ''
    if (localOcr.enabled) {
      // 对图片进行二次放大 否则可能识别不准
      img = images.resize(img, [parseInt(img.width * 2), parseInt(img.height * 2)])
      result = localOcr.recognize(img)
      if (result) {
        result = result.replace(/\n/g, '').replace(/\s/g, '')
      }
      debugInfo(['使用{}ocr识别倒计时时间文本: {}', localOcr.type, result])
      debugForDev(['图片数据：[data:image/png;base64,{}]', images.toBase64(img)])
    } else {
      let base64Str = images.toBase64(img)
      debugForDev(['image base64 [data:image/png;base64,{}]', base64Str])
      result = BaiduOcrUtil.recognizeGeneralText(base64Str)
      debugInfo(['使用百度API识别倒计时时间文本为：{}', JSON.stringify(result)])
    }
    let hourMinutes = /(\d+)小时((\d+)分)?/
    let minuteSeconds = /(\d+)分((\d+)秒)?/
    let restTime = -1
    if (hourMinutes.test(result)) {
      let regexResult = hourMinutes.exec(result)
      restTime = this.resolveOverflowNumber(regexResult[1]) * 60 + (regexResult[2] ? this.resolveOverflowNumber(regexResult[2]) : 0)
    } else if (minuteSeconds.test(result)) {
      restTime = this.resolveOverflowNumber(minuteSeconds.exec(result)[1]) + 1
    }
    debugInfo('计算得到剩余时间：' + restTime + '分')
    return restTime
  }

  /**
   * 可能存在识别结果分成两列 导致3小时55分变成 3小时55 + 5分 
   * 最终结果变成 3小时555分，此方法截取过长的 把555变回55
   * @param {string} number 
   */
  this.resolveOverflowNumber = function (number) {
    if (number.length > 2) {
      number = number.substring(0, 2)
    }
    return parseInt(number)
  }

  this.setTimeoutExit = function () {
    let _this = this
    setTimeout(function () {
      _this.setFloatyTextColor('#ff0000')
      _this.setFloatyInfo(null, '再见')
      sleep(2000)
      exit()
    }, 30000)
  }

  this.checkByOcr = function (region, contentRegex, limit) {
    if (!localOcr.enabled) {
      warnInfo(['请至少安装mlkit-ocr插件或者修改版AutoJS获取本地OCR能力'])
      return false
    }
    _FloatyInstance.hide()
    sleep(50)
    try {
      limit = limit || 3
      while (limit-- > 0) {
        let screen = _commonFunctions.checkCaptureScreenPermission()
        if (screen) {
          debugInfo(['ocr识别 {} 内容：{}', region ? '区域' + JSON.stringify(region) : '', contentRegex])
          let result = localOcr.recognizeWithBounds(screen, region, contentRegex)
          if (result && result.length > 0) {
            return result[0]
          }
        }
        sleep(1000)
      }
      return false
    } finally {
      _FloatyInstance.restore()
    }
  }

  this.start = function () {
    this.checker = YoloDetection.enabled ? new YoloChecker(this) : new ColorChecker(this)
    if (!this.launchApp()) {
      warnInfo(['打开项目失败，5分钟后重新尝试'])
      _commonFunctions.setUpAutoStart(5)
      return false
    }
    this.setFloatyInfo(null, '打开APP成功！')
    sleep(1000)
    if(!this.checkIsSleeping()) {
      this.checkIsOut()
    }
    if (this.checker.checkThief()) {
      // 揍过鸡
      _commonFunctions.setPunched()
    }
    WarningFloaty.clearAll()

    sleep(1000)
    this.checkAndFeed()
    WarningFloaty.clearAll()
    sleep(1000)
    fodderCollector.exec()
    sleep(1000)
    //做完任务再检查一次喂食剩余时间，雇佣小鸡可能会缩短时间
    this.checkAndFeed()
    WarningFloaty.clearAll()
    
    if (config.pick_shit) {
      this.checkAndPickShit()
    }
    sleep(2000)
    this.doFamily()
    sleep(1000)
    _commonFunctions.minimize()
    resourceMonitor.releaseAll()
  }

  /**
   * 获取测试用yoloChecker
   * 
   * @returns 测试用的checker
   */
  this.createYoloChecker = function () {
    return new YoloChecker(this)
  }

  /**
   * 获取测试用的colorChecker
   * 
   * @returns 测试用的checker
   */
  this.createColorChecker = function () {
    return new ColorChecker(this)
  }


  function ManorChecker (mainExecutor) {
    this.mainExecutor = mainExecutor
  }

  ManorChecker.prototype.checkSpeedSuccess = () => {
    errorInfo('this function should be override checkSpeedSuccess')
  }

  ManorChecker.prototype.checkAndClickShit = () => {
    errorInfo('this function should be override checkAndClickShit')
  }

  ManorChecker.prototype.checkAndCollectMuck = () => {
    errorInfo('this function should be override checkAndCollectMuck')
  }

  ManorChecker.prototype.checkThief = () => {
    errorInfo('this function should be override checkThief')
  }

  function ColorChecker (mainExecutor) {
    ManorChecker.call(this, mainExecutor)
  }
  ColorChecker.prototype = Object.create(ManorChecker.prototype)
  ColorChecker.prototype.constructor = ColorChecker
  ColorChecker.prototype.checkSpeedSuccess = function () {
    let useSpeedCard = config.useSpeedCard
    let img = null
    let checkSpeedup = false
    // 校验三次
    let checkCount = useSpeedCard ? 3 : 1
    WarningFloaty.addRectangle('校验加速卡是否成功使用', config.SPEED_CHECK_REGION)
    do {
      // 延迟一秒半
      sleep(1500)
      img = _commonFunctions.checkCaptureScreenPermission()
      checkSpeedup = images.findColor(img, config.SPEED_CHECK_COLOR, {
        region: config.SPEED_CHECK_REGION,
        threshold: config.color_offset || 4
      })
    } while (!checkSpeedup && --checkCount > 0)
    if (checkSpeedup) {
      yoloTrainHelper.saveImage(img, '加速吃饭中', 'speedup_eating')
      this.mainExecutor.setFloatyInfo(checkSpeedup, useSpeedCard ? "加速卡使用成功" : "检测到已使用加速卡")
      return true
    } else {
      this.mainExecutor.setFloatyTextColor('#ff0000')
      yoloTrainHelper.saveImage(img, '吃饭中可能没加速', 'speedup_failed')
      this.mainExecutor.setFloatyInfo({ x: config.SPEED_CHECK_REGION[0], y: config.SPEED_CHECK_REGION[1] }, useSpeedCard ? "加速卡使用失败" : "未使用加速卡")
      return false
    }
  }
  ColorChecker.prototype.checkAndClickShit = function () {
    let img = _commonFunctions.checkCaptureScreenPermission()
    let pickRegion = config.SHIT_CHECK_REGION || [435, 1925, 40, 40]
    let pickShitColor = config.PICK_SHIT_GRAY_COLOR || '#111111'
    let originImg = images.copy(img)
    img = images.grayscale(img)
    WarningFloaty.addRectangle('查找可捡屎区域', pickRegion)
    let point = images.findColor(img, pickShitColor, { region: pickRegion })
    if (point) {
      this.mainExecutor.setFloatyInfo({ x: pickRegion[0], y: pickRegion[1] }, "有屎可以捡")
      yoloTrainHelper.saveImage(originImg, '有屎可以捡', 'pick_shit')
      click(point.x, point.y)
      debugInfo(['find point：{},{}', point.x, point.y])
      return true
    }
    return false
  }
  ColorChecker.prototype.checkAndCollectMuck = function () {
    let collectRegion = config.COLLECT_SHIT_CHECK_REGION || [220, 2000, 80, 40]
    let collectShitColor = config.COLLECT_SHIT_GRAY_COLOR || '#535353'
    WarningFloaty.addRectangle('查找可捡屎点击确认区域', collectRegion)
    sleep(1000)
    let img = _commonFunctions.checkCaptureScreenPermission()
    yoloTrainHelper.saveImage(img, '执行捡屎', 'execute_pick_shit')
    img = images.grayscale(img)
    point = images.findColor(img, collectShitColor, { region: collectRegion })
    if (point) {
      click(point.x, point.y)
      debugInfo(['find point：{},{}', point.x, point.y])
    } else {
      warnInfo(['未找到执行捡屎标记位 寻找灰度颜色：{}', collectShitColor])
    }
  }

  ColorChecker.prototype.checkThief = function () {
    let punchedLeft = this.mainExecutor.checkThiefLeft()
    let punchedRight = this.mainExecutor.checkThiefRight()
    return punchedLeft || punchedRight
  }

  function YoloChecker (mainExecutor) {
    ManorChecker.call(this, mainExecutor)
  }
  YoloChecker.prototype = Object.create(ManorChecker.prototype)
  YoloChecker.prototype.constructor = YoloChecker
  YoloChecker.prototype.checkSpeedSuccess = function () {
    let speedupEating = this.mainExecutor.yoloCheck('是否加速吃饭中', { confidence: 0.7, labelRegex: 'speedup_eating' })
    let img = _commonFunctions.captureScreen()
    if (speedupEating) {
      yoloTrainHelper.saveImage(img, '加速吃饭中', 'speedup_eating')
      return true
    } else {
      yoloTrainHelper.saveImage(img, '吃饭中可能没加速', 'speedup_failed')
      return false
    }
  }

  YoloChecker.prototype.checkAndClickShit = function () {
    let hasShit = this.mainExecutor.yoloCheck('是否有屎', { confidence: 0.7, labelRegex: 'has_shit' })
    if (hasShit) {
      this.mainExecutor.setFloatyInfo(hasShit, '有屎可以捡')
      click(hasShit.x, hasShit.y)
      sleep(500)
      return true
    }
    return false
  }

  YoloChecker.prototype.checkAndCollectMuck = function () {
    let index = 0;
    let execPickMuck = null;
    while (execPickMuck = this.mainExecutor.yoloCheck('执行收集饲料', { confidence: 0.7, labelRegex: 'collect_muck' }, index)){
      this.mainExecutor.setFloatyInfo(execPickMuck, '收集饲料')
      click(execPickMuck.x, execPickMuck.y)
      index++
    }
    if (!execPickMuck && index==0) {
      warnInfo(['未能通过YOLO识别执行收集饲料的区域'])
    }
  }

  /**
   * 驱赶野鸡
   *
   * @param {*} findThief 
   * @returns 
   */
  YoloChecker.prototype.driveThief = function (findThief) {
    if (findThief) {
      debugInfo(['找到了野鸡：{},{}', findThief.x, findThief.y])
      automator.clickPointRandom(findThief.x, findThief.y)
      sleep(1000)
      let kickOut = this.mainExecutor.yoloCheck('赶走', { confidence: 0.7, labelRegex: 'kick-out' })
      if (kickOut) {
        automator.clickPointRandom(kickOut.x, kickOut.y)
        yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '关闭按钮', 'confirm_btn')
        let notLeaveMsg = widgetUtils.widgetGetOne('不留言', 1000)
        if (notLeaveMsg) {
          automator.clickRandom(notLeaveMsg)
        } else {
          this.mainExecutor.yoloClickConfirm(true)
        }
        sleep(1000)
        return true
      } else {
        warnInfo(['未能找到赶走按钮，请确认是否是邀请了工作小鸡'])
        automator.clickPointRandom(findThief.x, findThief.y)
      }
    }
    return false
  }

  YoloChecker.prototype.checkThief = function () {
    let kicked = false
    let workerCount = 0
    this.mainExecutor.setFloatyInfo(null, '准备校验是否有偷吃野鸡')
    let findThiefLeft = this.mainExecutor.yoloCheck('偷吃野鸡', { confidence: 0.7, labelRegex: 'thief_chicken', filter: (result) => result.x < config.device_width / 2 })
    this.driveThief(findThiefLeft) ? kicked = true : (findThiefLeft && workerCount++)
    let findThiefRight = this.mainExecutor.yoloCheck('偷吃野鸡', { confidence: 0.7, labelRegex: 'thief_chicken', filter: (result) => result.x > config.device_width / 2 })
    this.driveThief(findThiefRight) ? kicked = true : (findThiefRight && workerCount++)

    if (!kicked) {
      debugInfo('未找到偷吃野鸡')
      this.mainExecutor.setFloatyInfo(null, '未找到偷吃野鸡')
    }

    _commonFunctions.setWorkerCount(workerCount)
    return kicked
  }
}

module.exports = new AntManorRunner()


function openAlipayMultiLogin (reopen) {
  if (config.multi_device_login && !reopen) {
    debugInfo(['已开启多设备自动登录检测，检查是否有 进入支付宝 按钮'])
    let entryBtn = widgetUtils.widgetGetOne(/^进入支付宝$/, 1000)
    if (entryBtn) {
      _FloatyInstance.setFloatyText('其他设备正在登录，等待5分钟后进入')
      _commonFunctions.waitForAction(300, '等待进入支付宝')
      unlocker && unlocker.exec()
      automator.clickRandom(entryBtn)
      sleep(1000)
      return true
    } else {
      debugInfo(['未找到 进入支付宝 按钮'])
    }
  }
}
