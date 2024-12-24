
let { config, storage_name } = require('../config.js')(runtime, this)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, this)
let commonFunctions = singletonRequire('CommonFunction')
let widgetUtils = singletonRequire('WidgetUtils')
let OpenCvUtil = require('../lib/OpenCvUtil.js')
let automator = singletonRequire('Automator')
let logUtils = singletonRequire('LogUtils')
let localOcr = require('../lib/LocalOcrUtil.js')
let LogFloaty = singletonRequire('LogFloaty')
let YoloDetection = singletonRequire('YoloDetectionUtil')
let AiUtil = require('../lib/AIRequestUtil.js')
let FloatyInstance = singletonRequire('FloatyUtil')
let manorRunner = require('../core/AntManorRunner.js')
let taskUtil = require('../lib/TaskUtil.js')

function Collector () {
  let _this = this
  let collectBtnContetRegex = /^(x\d+g)领取$/
  this.useSimpleForMatchCollect = true
  this.useSimpleForCloseCollect = true

  this.storage = storages.create(storage_name)

  this.imageConfig = config.fodder_config
  
  this.collectEntry = null;

  this.exec = function () {
    let screen = commonFunctions.captureScreen()
    if (screen) {
      LogFloaty.pushLog('查找领饲料入口')
      this.collectEntry = this.findCollectEntry(screen)
      if (this.collectEntry) {
        LogFloaty.pushLog('已找到领饲料入口')
        debugInfo('找到了领饲料位置' + JSON.stringify(this.collectEntry))
        automator.clickPointRandom(this.collectEntry.centerX(), this.collectEntry.centerY())
        sleep(3000)
        if (!this.isInTaskUI()) {
          //automator.clickPointRandom(this.collectEntry.centerX(), this.collectEntry.centerY())
          sleep(3000)
        }
        this.doDailyTasks()
        LogFloaty.pushLog('每日任务执行完毕，开始收集可收取饲料')
        this.collectAllIfExists()
        sleep(1000)
      } else {
        LogFloaty.pushWarningLog('未能找到领饲料入口')
        warnInfo(['未能找到领饲料入口'], true)
      }
      screen.recycle()
    }
  }

  /**
   * 查找领饲料入口
   */
  this.findCollectEntry = function (screen) {
    let originScreen = images.copy(screen)
    if (YoloDetection.enabled) {
      LogFloaty.pushLog('')
      let result = YoloDetection.forward(screen, { confidence: 0.7, labelRegex: 'collect_food' })
      if (result && result.length > 0) {
        let { x, y, centerX, centerY } = result[0]
        LogFloaty.pushLog('Yolo找到：领饲料入口')
        return {
          x: x, y: y,
          centerX: () => centerX,
          centerY: () => centerY
        }
      }
    }
    if (localOcr.enabled) {
      LogFloaty.pushLog('尝试OCR查找领饲料入口')
      let result = localOcr.recognizeWithBounds(screen, null, '领饲料')
      if (result && result.length > 0) {
        return result[0].bounds
      }
    }
    LogFloaty.pushLog('ocr不支持或未找到，尝试图片查找领饲料位置')
    let matchResult = OpenCvUtil.findByGrayBase64(screen, this.imageConfig.fodder_btn)
    if (!matchResult) {
      // 尝试
      matchResult = OpenCvUtil.findBySIFTBase64(screen, this.imageConfig.fodder_btn)
      this.useSimpleForMatchCollect = false
    }
    if (matchResult) {
      logUtils.debugInfo(['找到目标：「{},{}」[{},{}]', matchResult.roundX(), matchResult.roundY(), matchResult.width(), matchResult.height()])
      let template_img_for_collect = images.toBase64(images.clip(originScreen, matchResult.roundX(), matchResult.roundY(), matchResult.width(), matchResult.height()))
      config.overwrite('fodder.fodder_btn', template_img_for_collect)
      logUtils.debugInfo('自动更新图片配置 fodder.fodder_btn')
      logUtils.debugForDev(['自动保存匹配图片：{}', template_img_for_collect])
      logUtils.debugInfo('找到了领饲料位置' + JSON.stringify(matchResult))
      return matchResult
    }
  }

  let randomTop = {start:config.device_height/2-50, end:config.device_height/2+50}
  let randomBottom= {start:config.device_height * 0.85 - 50, end:config.device_height * 0.85 + 10}

  function randomScrollDown () {
    automator.randomScrollDown(randomBottom.start, randomBottom.end, randomTop.start, randomTop.end)
  }

  function randomScrollUp (isFast) {
    automator.randomScrollUp(randomTop.start, randomTop.end, randomBottom.start, randomBottom.end,isFast)
  }

  function scrollUpTop () {
    let limit = 5
    do {
      randomScrollUp(true)
    } while (limit-- > 0)
  }

  this.doDailyTasks = function () {
    if (!this.isInTaskUI()) {
      LogFloaty.pushLog('未打开每日任务界面')
      return false
    }
    
    LogFloaty.pushLog('执行每日任务')

    let limit = 10
    while (!widgetUtils.widgetCheck('完成任务后会获赠饲料.*', 1000) && limit-- > 0) {
        randomScrollDown()
        sleep(1000)
    }

    let taskInfos = [
      {btnRegex:'去答题', tasks:[
        {taskType:'answerQuestion',titleRegex:'.*'},
      ]},
      {btnRegex:'去喂鱼', tasks:[
        {taskType:'feedFish',titleRegex:'去鲸探喂鱼.*'},
      ]},
      {btnRegex:'去完成', tasks:[
        {taskType:'browse',titleRegex:'庄园小视频',timeout:20,needScroll:false},
        {taskType:'browse',titleRegex:'去杂货铺逛一逛',timeout:15,needScroll:true},
        {taskType:'browse',titleRegex:'逛一逛.*助农专场',timeout:3,needScroll:false},
        {taskType:'browse',titleRegex:'去支付宝会员签到',timeout:3,needScroll:false},
        {taskType:'browse',titleRegex:'去神奇海洋逛一逛',timeout:3,needScroll:false},
        {taskType:'browse',titleRegex:'.*农货.*',timeout:15,needScroll:true},
        {taskType:'browse',titleRegex:'.*芝麻.*',timeout:3,needScroll:false},
        {taskType:'browse',titleRegex:'逛逛花呗.*',timeout:3,needScroll:false},
        {taskType:'browse',titleRegex:'.*限时.*',timeout:3,needScroll:false},

        {taskType:'app',titleRegex:'去逛一逛淘宝视频',timeout:20,needScroll:false},
        {taskType:'app',titleRegex:'去逛一逛淘金币小镇',timeout:10,needScroll:false},
        {taskType:'app',titleRegex:'去闲鱼逛一逛',timeout:15,needScroll:false},
        {taskType:'app',titleRegex:'去一淘APP逛逛',timeout:15,needScroll:false},
        {taskType:'app',titleRegex:'去点淘逛一逛',timeout:20,needScroll:false},
        {taskType:'app',titleRegex:'去淘宝签到逛一逛',timeout:10,needScroll:false},
        {taskType:'app',titleRegex:'去菜鸟.*',timeout:15,needScroll:false},

        {taskType:'luckyDraw',titleRegex:'.*抽抽乐.*'},
        {taskType:'farmFertilize',titleRegex:'去芭芭农场.*'},
        {taskType:'doCook',titleRegex:'小鸡厨房.*'},
        {taskType:'doChickenPlay',titleRegex:'去小鸡乐园.*'},
      ]},
    ]
    
    // 雇佣小鸡
    this.hireChicken()
  
    // 其他任务
    taskUtil.initProject(this,'Manor')
    taskUtil.doTasks(taskInfos)
  
    scrollUpTop()
  }

  this.answerQuestion = function (titleObj,entryBtn) {
    let ai_type = config.ai_type || 'kimi'
    let kimi_api_key = config.kimi_api_key
    let chatgml_api_key = config.chatgml_api_key
    let key = ai_type === 'kimi' ? kimi_api_key : chatgml_api_key
    if (!key) {
      LogFloaty.pushLog('推荐去KIMI开放平台申请API Key并在可视化配置中进行配置')
      LogFloaty.pushLog('否则免费接口这个智障AI经常性答错')
    }
  
    let result = false
    if (entryBtn) {
      LogFloaty.pushLog('等待进入 '+titleObj.text())
      entryBtn.click()
      sleep(3000)
      widgetUtils.widgetWaiting('题目来源.*',null, 3000)
      sleep(1000)
      let result = AiUtil.getQuestionInfo(ai_type, key)
      if (result) {
        LogFloaty.pushLog('答案解释：' + result.describe)
        LogFloaty.pushLog('答案坐标：' + JSON.stringify(result.target))
        automator.clickPointRandom(result.target.x, result.target.y)
      }
      sleep(1000)
      automator.back()
      sleep(1000)
    }
    return !!result
  }

  this.luckyDraw = function (titleObj,entryBtn) {
    //抽奖一次并返回奖品信息
    let luckyDrawOnce = function () {
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
        let confirmBtn = widgetUtils.widgetGetOne('知道啦|立即换装',2000)
        if (confirmBtn) {
          automator.clickRandom(confirmBtn)
        }
        sleep(1000)
        return luckyResult
      }
    }
    
    LogFloaty.pushLog('准备抽奖')
    let result = false
    if (titleObj) {
      titleObj.click()
      sleep(3000)

      LogFloaty.pushLog('抽抽乐 完成任务')
      let hasTask = false
      do {
        hasTask = false
        let btns = widgetUtils.widgetGetAll('去完成', 1000)
        if (btns && btns.length > 0) {
          btns.forEach(btn => {
            let titleObj = commonFunctions.getTaskTitleObj(btn)
            if (titleObj) {
              let titleText = titleObj.text()
              LogFloaty.pushLog('发现任务：'+titleText)
              if (titleText.match('去杂货铺逛一逛.*')) {
                hasTask = this.doBrowseTask(titleText, btn, 15, true) || hasTask
              } else if (titleText.match('试用.*')) {
                hasTask = this.doBrowseTask(titleText, btn, 3, false) || hasTask
              }
            }
          })
        }

        LogFloaty.pushLog('抽抽乐 查找领取')
        let collects = widgetUtils.widgetGetAll('.*领取',2000)
        if (collects&& collects.length > 0) {
          hasTask = true
          collects.forEach(collect => {
            collect.click()
            sleep(2000)
          })
        }
      } while (hasTask)
      
      //抽奖直到次数用完
      LogFloaty.pushLog('抽抽乐 抽奖')  
      do {
        // 抽奖一次
        drawResult = luckyDrawOnce()
        let drawTimes = drawResult? drawResult[0]:0
        if (drawTimes <= 0) {
          debugInfo('抽奖机会用完啦')
          break
        }
      } while (true)
        
      result = true
      automator.back()
      sleep(1000)
    }
    return result
  }

  this.farmFertilize = function (titleObj,entryBtn) {
    LogFloaty.pushLog('准备施肥')

    let result = false
    if (entryBtn) {
      entryBtn.click()
      LogFloaty.pushLog('等待进入芭芭农场')
      sleep(8000)
      LogFloaty.pushLog('查找 施肥 按钮')
      let fertilizeBtn = null
      let taskBtn = widgetUtils.widgetGetOne('^任务列表$', 3000)
      if (taskBtn) {
        fertilizeBtn = {x:config.device_width/2, y:taskBtn.bounds().centerY()}
      } else {
        taskBtn = localOcr.recognizeWithBounds(commonFunctions.captureScreen(), null, '^施肥$')
        if (taskBtn && taskBtn.length > 0) {
          fertilizeBtn = {x:taskBtn[0].bounds().centerX(),y:taskBtn[0].bounds().centerY()}
        }
      }
      if (fertilizeBtn) {
        automator.clickPointRandom(fertilizeBtn.x, fertilizeBtn.y)
        sleep(5000)
      } else {
        LogFloaty.pushWarningLog('未找到施肥按钮')
      }
      result = !!fertilizeBtn
    }
    return result
  }

  //小鸡厨房
  this.doCook = function (titleObj,entryBtn) {
    LogFloaty.pushLog('准备小鸡厨房')

    let result = false
    if (entryBtn) {
      entryBtn.click()
      LogFloaty.pushLog('等待进入小鸡厨房')
      sleep(3000)
      LogFloaty.pushLog('查找 领食材和做美食 按钮')
      let ocrResult = localOcr.recognizeWithBounds(commonFunctions.captureScreen(), null, '^.*食材|做美食|\\d+肥料$')
      if (ocrResult && ocrResult.length >= 0) {
        let cookBtn = ocrResult.filter(item => item.label.match(/做美食/) && item.bounds.top>config.device_height/4*3)
        if (cookBtn && cookBtn.length > 0) {
          cookBtn = cookBtn[0].bounds
          debugInfo('获取领食材按钮并依次点击')
          let getBtns = ocrResult.filter(item => item.label.match(/^食材|领今日食材$/))
          if (getBtns && getBtns.length > 0) {
            getBtns.forEach(item => {
              let bounds = item.bounds
              automator.clickPointRandom(bounds.centerX(), bounds.centerY())
              sleep(2000)
            })
          }
          debugInfo('做美食直到食材不足')
          while (cookBtn && !manorRunner.isSleep) {
            automator.clickPointRandom(cookBtn.centerX(), cookBtn.centerY())
            sleep(5000)
            let resultText = widgetUtils.widgetGetOne('制作成功|食材不够啦',5000)
            let closeBtn = widgetUtils.widgetGetOne('关闭',2000)
            if (closeBtn) {
              automator.clickRandom(closeBtn)
              sleep(2000)
            }
            if (resultText && resultText.text().match(/食材不够啦/)) {
              break
            }
          }
          result = true
        }
        debugInfo('领取厨余肥料')
        let collectBtn = ocrResult.filter(item => item.label.match(/\d+肥料/))
        if (collectBtn && collectBtn.length > 0) {
          collectBtn = collectBtn[0].bounds
          automator.clickPointRandom(collectBtn.centerX(), collectBtn.centerY())
          sleep(2000)
        }
      } else {
        LogFloaty.pushLog('未找到做美食按钮')
      }
      result = result
    }
    return result
  }
  
  //小鸡乐园
  this.doChickenPlay = function (titleObj,entryBtn) {
    LogFloaty.pushLog('准备小鸡乐园')
    let result = false
    if (entryBtn) {
      entryBtn.click()
      LogFloaty.pushLog('等待进入小鸡乐园')
      if (widgetUtils.widgetWaiting('在乐园玩一玩，得宝箱','打开乐园界面',5000)) {
        let titleText = widgetUtils.widgetGetOne('星星球',3000)
        if (titleText) {
          let clickBtn = titleText.parent().child(3)
          if (clickBtn) {
            clickBtn.click()
            sleep(5000)
            let starBallPlayer = require('../unit/星星球.js')
            result = starBallPlayer.exec()
            debugInfo('星星球完成')

            automator.back()
            sleep(2000)

            let confirmBtn = null
            while (confirmBtn = widgetUtils.widgetGetOne('去开宝箱.*|继续开宝箱.*',3000)) {
              automator.clickRandom(confirmBtn)
              sleep(5000)
            }
            confirmBtn = widgetUtils.widgetGetOne('去玩一玩.*',3000)
            if (confirmBtn) {
              automator.clickRandom(confirmBtn)
              sleep(1000)
            }
            //result = true
          }
        }
      }
      let closeBtn = widgetUtils.widgetGetOne('关闭',3000,null,null,m => m.filter(uo=>uo.bounds().top>300))
      if (closeBtn) {
        automator.clickRandom(closeBtn)
        sleep(1000)
      }
      LogFloaty.pushLog('小鸡乐园完成，重新打开领饲料界面')
      if (this.collectEntry) {
        automator.clickPointRandom(this.collectEntry.centerX(), this.collectEntry.centerY())
        sleep(3000)
      }
    }
    return result
  }
  
  //喂鱼任务
  this.feedFish = function (titleObj,entryBtn) {
    LogFloaty.pushLog('准备鲸探喂鱼')
    let result = false
    if (entryBtn) {
      entryBtn.click()
      LogFloaty.pushLog('等待进入喂鱼界面')
      if (widgetUtils.widgetWaiting('放生池容量.*', '打开喂鱼界面', 8000)) {
        sleep(3000)
        let feedBtn = widgetUtils.widgetGetOne('鱼食\\(\\d+/\\d+\\)',8000)
        if (feedBtn){
          automator.clickRandom(feedBtn.parent())
          sleep(2000)
        }
        feedBtn = widgetUtils.widgetGetOne('喂鱼',3000)
        if (feedBtn){
          automator.clickRandom(feedBtn)
          sleep(2000)
        }
        LogFloaty.pushLog('喂鱼完成，返回主界面')
        automator.back()
        sleep(2000)
        result = true
      }
    }
    return result
  }

  this.hireChicken = function() {
    LogFloaty.pushLog('准备雇佣小鸡')

    //当前工作小鸡满，直接返回
    if (commonFunctions.getWorkerCount()==2) {
      logUtils.debugInfo('当前工作小鸡满，不雇佣小鸡直接返回')
      return false
    }

    let result = false
    let titleObj = widgetUtils.widgetGetOne('雇佣小鸡拿饲料', 3000)
    let entryBtn = titleObj
    if (entryBtn) {
      entryBtn.click()
      LogFloaty.pushLog('等待进入雇佣小鸡窗口')
      sleep(5000)
      let hireRegex = '当前还可雇佣(\\d+)只小鸡'
      let hireText = widgetUtils.widgetGetOne(hireRegex,5000)
      if (hireText) {
        let hireCount = new RegExp(hireRegex).exec(hireText.text())[1]
        LogFloaty.pushLog('可雇佣小鸡：' + hireCount)
        for(let i = 0; i < hireCount; i++){
          let hireBtn = widgetUtils.widgetGetOne('雇佣并通知')
          if (hireBtn) {
            automator.clickRandom(hireBtn)
            sleep(1000)
          }
        }
      }
      automator.back()
      result = !!hireText
    }
    return result
  }

  /**
   * 获取当前界面是否在项目界面
   */
  this.isInProjectUI = function (projectCode, timeout) {
    timeout = timeout || 2000
    return widgetUtils.idWaiting('wrapper-barrage', '蚂蚁庄园', timeout)
  }

  /**
   * 获取当前界面是否在任务界面
   */
  this.isInTaskUI = function (projectCode, timeout) {
    timeout = timeout || 2000
    return widgetUtils.widgetWaiting('庄园小课堂', '任务列表', timeout)
  }

  this.startApp = function (projectCode) {
    manorRunner.launchApp()
  }

  this.openTaskWindow = function (projectCode) {
    if (this.collectEntry) {
      LogFloaty.pushLog('已找到领饲料入口')
      automator.clickPointRandom(this.collectEntry.centerX(), this.collectEntry.centerY())
      sleep(3000)
      return this.isInTaskUI(projectCode)
    } else {
      LogFloaty.pushWarningLog('未能找到领饲料入口')
      return false
    }
  }

  this.doBrowseTask = function (titleText, entryBtn, timeout, needScroll) {
    if (!entryBtn) {
      LogFloaty.pushLog('无入口按钮，跳过执行：'+titleText)
      return false
    }
    titleText = titleText || entryBtn.text()
    timeout = timeout || 15
  
    entryBtn.click()
    sleep(1000)
    LogFloaty.pushLog('等待进入 '+titleText+', 计时：'+timeout+', 滑动：'+needScroll)
    sleep(2000);
  
    if (timeout) {
      LogFloaty.pushLog(titleText+' 等待倒计时结束')
      let limit = timeout
      while (limit-- > 0) {
        sleep(1000)
        LogFloaty.replaceLastLog(titleText+' 等待倒计时结束 剩余：' + limit + 's')
        if (limit % 2 == 0 && needScroll) {
          automator.randomScrollDown()
        }
      }
    } else {
      sleep(3000)
      LogFloaty.pushLog('啥也不用干 直接返回')
    }
    automator.back()
    sleep(1000)
    return true
  }
  
  function collectCurrentVisible () {
    auto.clearCache && auto.clearCache()
    let visiableCollect = widgetUtils.widgetGetAll(collectBtnContetRegex) || []
    let originList = visiableCollect
    if (visiableCollect.length > 0) {
      visiableCollect = visiableCollect.filter(v => commonFunctions.isObjectInScreen(v) && checkIsValid(v))
    }
    if (visiableCollect.length > 0) {
      _this.collected = true
      logUtils.debugInfo(['点击领取'])
      // automator.clickRandom(visiableCollect[0])
      visiableCollect[0].click()
      sleep(500)
      let full = widgetUtils.widgetGetOne(config.fodder_config.feed_package_full || '饲料袋.*满.*|知道了', 1000)
      if (full) {
        LogFloaty.pushWarningLog('饲料袋已满')
        logUtils.warnInfo(['饲料袋已满'], true)
        _this.food_is_full = true
        let confirmBtn = widgetUtils.widgetGetOne('确认|知道了', 1000)
        if (confirmBtn) {
          // if (confirmBtn.text()!='知道了')
          let closeBtn = confirmBtn.parent().parent().child(0).child(0)
          automator.clickRandom(closeBtn)
          sleep(1000)
        }
        return false
      }
      return collectCurrentVisible()
    } else {
      _this.collected = false
      logUtils.debugInfo(['可领取控件均无效或不可见：{}', JSON.stringify((() => {
        return originList.map(target => {
          let bounds = target.bounds()
          let visibleToUser = target.visibleToUser()
          return { visibleToUser, x: bounds.left, y: bounds.top, width: bounds.width(), height: bounds.height() }
        })
      })())])
    }
    let allCollect = widgetUtils.widgetGetAll(collectBtnContetRegex)
    return allCollect && allCollect.length > 0
  }

  this.collectAllIfExists = function (lastTotal, findTime) {
    if (findTime >= 5) {
      LogFloaty.pushWarningLog('超过5次未找到可收取控件，退出查找')
      this.closeFoodCollection()
      return
    }
    LogFloaty.pushLog('查找 领取 按钮')
    let allCollect = widgetUtils.widgetGetAll(collectBtnContetRegex)
    if (allCollect && allCollect.length > 0) {
      let total = allCollect.length
      if (collectCurrentVisible()) {
        logUtils.logInfo(['滑动下一页查找目标'], true)
        let startY = config.device_height - config.device_height * 0.15
        let endY = startY - config.device_height * 0.3
        automator.gestureDown(startY, endY)
      } else if (this.food_is_full) {
        this.closeFoodCollection()
        return
      }
      sleep(500)
      if (!this.collected) {
        findTime = findTime ? findTime : 1
      } else {
        findTime = null
      }
      this.collectAllIfExists(total, findTime ? findTime + 1 : null)
    } else {
      this.closeFoodCollection()
    }
  }

  this.closeFoodCollection = function () {
    LogFloaty.pushWarningLog('无可领取饲料')
    logUtils.warnInfo(['无可领取饲料'], true)
    if (YoloDetection.enabled) {
      let result = YoloDetection.forward(commonFunctions.captureScreen(), { confidence: 0.7, labelRegex: 'close_btn|confirm_btn' })
      if (result && result.length > 0) {
        LogFloaty.pushLog('通过yolo找到了关闭按钮')
        automator.clickPointRandom(result[0].centerX, result[0].centerY)
      } else {
        LogFloaty.pushWarningLog('无法通过yolo查找到关闭按钮')
        logUtils.warnInfo(['无法通过yolo查找到关闭按钮'])
        automator.clickPointRandom(150,300)
      }
    } else {
      let screen = commonFunctions.captureScreen()
      if (screen) {
        screen = images.copy(images.grayscale(screen), true)
        let originScreen = images.copy(images.cvtColor(screen, "GRAY2BGRA"))
        let matchResult = OpenCvUtil.findByGrayBase64(screen, config.fodder_config.close_interval, true)
        if (!matchResult) {
          matchResult = OpenCvUtil.findBySIFTBase64(screen, config.fodder_config.close_interval)
          this.useSimpleForCloseCollect = false
        }
        if (matchResult) {
          automator.clickPointRandom(matchResult.centerX(), matchResult.centerY())
          if (!this.useSimpleForCloseCollect) {
            let template_img_for_close_collect = images.toBase64(images.clip(originScreen, matchResult.left, matchResult.top, matchResult.width(), matchResult.height()))
            config.overwrite('fodder.close_interval', template_img_for_close_collect)
            logUtils.debugInfo('自动更新图片配置 fodder.close_interval')
            logUtils.debugForDev(['自动保存匹配图片：{}', template_img_for_close_collect])
          }
        } else {
          logUtils.warnInfo(['无法通过图片查找到关闭按钮'])
          automator.back()
        }
        screen.recycle()
      }
    }
  }
}

module.exports = new Collector()

/**
 * 判断高度是否符合条件
 *
 * @param {UIObject} target 
 * @returns 
 */
function checkIsValid (target) {
  let bounds = target.bounds()
  if (bounds.height() < 10) {
    logUtils.debugInfo(['控件高度小于10，无效控件'])
    return false
  }
  return true
}

/**
 * @deprecated OCR不准放弃 
 * @param {*} regex 
 * @param {*} target 
 * @param {*} screen 
 * @returns 
 */
function checkOcrText (regex, target, screen) {
  let bounds = target.bounds()
  if (bounds.height() < 10) {
    logUtils.debugInfo(['控件高度小于10，无效控件'])
    return false
  }
  if (!localOcr.enabled) {
    return true
  }
  screen = screen || commonFunctions.checkCaptureScreenPermission()
  if (screen) {
    let region = [bounds.left, bounds.top, bounds.width(), bounds.height()]
    logUtils.debugInfo(['截取图片信息: data:image/png;base64,{}', images.toBase64(images.clip(screen, region[0], region[1], region[2], region[3]))])
    // 进行灰度处理 降低干扰
    screen = images.grayscale(screen)
    logUtils.debugInfo(['校验图片区域文字信息：{}', JSON.stringify(region)])
    let text = localOcr.recognize(screen, region)
    if (text) {
      text = text.replace(/\n/g, '')
      return new RegExp(regex).test(text)
    }
  }
  return false
}