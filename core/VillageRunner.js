let { config } = require('../config.js')(runtime, global)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, global)
let commonFunctions = singletonRequire('CommonFunction')
let resourceMonitor = require('../lib/ResourceMonitor.js')(runtime, global)
let widgetUtils = singletonRequire('WidgetUtils')
let automator = singletonRequire('Automator')
let alipayUnlocker = singletonRequire('AlipayUnlocker')
let FileUtils = singletonRequire('FileUtils')
let openCvUtil = require('../lib/OpenCvUtil.js')
let FloatyInstance = singletonRequire('FloatyUtil')
let localOcr = require('../lib/LocalOcrUtil.js')
let WarningFloaty = singletonRequire('WarningFloaty')
let LogFloaty = singletonRequire('LogFloaty')
let yoloTrainHelper = singletonRequire('YoloTrainHelper')
let YoloDetection = singletonRequire('YoloDetectionUtil')
let AiUtil = require('../lib/AIRequestUtil.js')
let taskUtil = require('../lib/TaskUtil.js')

FloatyInstance.enableLog()
// automator.registerVisualHelper(WarningFloaty)

let villageConfig = config.village_config
// 摆摊摊位框选 带文字
villageConfig.booth_position_left = villageConfig.booth_position_left || [193, 1659, 436, 376]
villageConfig.booth_position_right = villageConfig.booth_position_right || [629, 1527, 386, 282]
function VillageRunner () {
  let _this = this
  // 已访问的好友 避免识别失败后重复进入
  this.visited_friends = []
  // 当前一摆摊的摊位
  let currentBoothSetted = 0
  this.exec = function () {
    _this.nextVisitTime = null
    try {
      if (!this.openMyVillage()) {
        warnInfo(['打开项目失败，5分钟后重新尝试'])
        commonFunctions.setUpAutoStart(5)
        return false
      }
      sleep(1000)
      collectMyCoin()
      sleep(500)
      checkAnyEmptyBooth()
      waitForLoading()
      checkMyBooth()
      waitForLoading()
      // 加速产币
      this.speedAward()

      debugInfo(['设置 {} 分钟后启动', _this.nextVisitTime || villageConfig.interval_time || 120])
      commonFunctions.setUpAutoStart(_this.nextVisitTime || villageConfig.interval_time || 120)
    } catch (e) {
      errorInfo('执行异常 五分钟后重试' + e)
      commonFunctions.setUpAutoStart(5)
      commonFunctions.printExceptionStack(e)
    }
  }

  this.openMyVillage = function (reopen, retry) {
    LogFloaty.pushLog('准备打开蚂蚁新村')
    app.startActivity({
      action: 'VIEW',
      data: 'alipays://platformapi/startapp?appId=68687809',
      packageName: 'com.eg.android.AlipayGphone'
    })
    sleep(500)
    FloatyInstance.setFloatyInfo({ x: config.device_width / 2, y: config.device_height / 2 }, "查找是否有'打开'对话框")
    let startTime = new Date().getTime()
    while (new Date().getTime() - startTime < 30000) {
      let confirm = widgetUtils.widgetGetOne(/^打开$/, 1000)
      if (confirm) {
        automator.clickRandom(confirm)
        sleep(1000)
      }
        
      if (openAlipayMultiLogin(reopen)) {
        return this.openMyVillage(true)
      }
  
      if (config.is_alipay_locked) {
        alipayUnlocker.unlockAlipay()
        sleep(1000)
      }

      if (waitForLoading(2000)) {
        FloatyInstance.setFloatyText('已进入蚂蚁新村')
        return true
      }

      sleep(1000)
    }

    if (!retry) {
      LogFloaty.pushWarningLog('打开蚂蚁新村失败，重新打开')
      killAlipay()
      sleep(3000)
      return this.openMyVillage(false, true)
    }
    errorInfo('打开蚂蚁新村失败')
    return false
  }

  function openAlipayMultiLogin (reopen) {
    if (config.multi_device_login && !reopen) {
      debugInfo(['已开启多设备自动登录检测，检查是否有 进入支付宝 按钮'])
      let entryBtn = widgetUtils.widgetGetOne(/^进入支付宝$/, 1000)
      if (entryBtn) {
        let storage = storages.create("alipay_multi_login")
        let multiLoginFlag = storage.get("flag")
        let multiLoginTime = storage.get("timestamp")
        let currentTime = new Date().getTime()
        let waitMin = 10
        if (!multiLoginFlag) {
          FloatyInstance.setFloatyText('检测到其他设备登录，' + waitMin + '分钟后重试')
          debugInfo('检测到其他设备登录,记录时间并设置10分钟后重试')
          storage.put("flag", true)
          storage.put("timestamp", currentTime)
          commonFunctions.setUpAutoStart(waitMin)
          exit()
        } else if (currentTime - multiLoginTime >= waitMin * 60 * 1000) {
          FloatyInstance.setFloatyText('等待时间已到，点击进入支付宝')
          debugInfo('已等待10分钟,点击进入支付宝')
          automator.clickRandom(entryBtn)
          sleep(1000)
          return true
        } else {
          let remainMinutes = Math.ceil((waitMin * 60 * 1000 - (currentTime - multiLoginTime)) / (60 * 1000))
          FloatyInstance.setFloatyText('等待时间未到，还需等待' + remainMinutes + '分钟')
          debugInfo('等待时间未到10分钟,设置剩余时间后重试')
          commonFunctions.setUpAutoStart(remainMinutes)
          exit()
        }
      } else {
        debugInfo(['未找到 进入支付宝 按钮'])
      }
    }
  }

  function collectMyCoin () {
    let findByYolo = false
    if (YoloDetection.enabled) {
      let collectCoin = yoloCheck('收集金币', { confidence: 0.7, labelRegex: 'collect_coin' })
      if (collectCoin) {
        automator.clickPointRandom(collectCoin.x, collectCoin.y)
        findByYolo = true
      }
    }
    if (!findByYolo) {
      // 自动点击自己的能量豆
      automator.clickPointRandom(villageConfig.village_reward_click_x, villageConfig.village_reward_click_y)
    }

    let point = null, screen = null, ocrResult = null
    if (localOcr.enabled) {
      screen = commonFunctions.captureScreen()
      //识别肥料袋并点击
      debugInfo(['尝试OCR识别 肥料袋'])
      ocrResult = localOcr.recognizeWithBounds(screen, null, '^肥$')
      if (ocrResult && ocrResult.length > 0) {
        point = ocrResult[0].bounds
        FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '找到了肥料袋')
        sleep(500)
        automator.clickPointRandom(point.centerX(), point.centerY())
        sleep(1000)
      }

        //识别小摊结余并点击
      debugInfo(['尝试OCR识别 小摊结余'])
      point = null
      ocrResult = localOcr.recognizeWithBounds(screen, null, '小摊结余')
      if (ocrResult && ocrResult.length > 0) {
        point = ocrResult[0].bounds
      }
      if (point) {
        FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '找到了小摊结余按钮')
        sleep(500)
        automator.clickPointRandom(point.centerX(), point.centerY()-50)
        sleep(2000)
        //查找一键丢肥料按钮
        let oneKeyBtn = widgetUtils.widgetGetOne(/^一键丢肥料.*/, 5000)
        //点击一次丢肥料按钮
        if (oneKeyBtn) {
          debugInfo(['点击一次丢肥料按钮'])
          automator.clickRandom(oneKeyBtn)
          sleep(1000)
          //等待确认丢肥料按钮出现并点击
          let confirmBtn = widgetUtils.widgetGetOne(/^确认丢肥料$/, 2000)
          if (confirmBtn) {
            debugInfo(['点击确认丢肥料按钮'])
            automator.clickRandom(confirmBtn)
            sleep(1000)
          }

          let popupBound = oneKeyBtn.parent().parent().bounds()
          findCloseButtonAndClick({x:popupBound.right-50, y:popupBound.top+30})
        }
      } else {
        LogFloaty.pushWarningLog('未找到小摊结余')
      }
    }
  }

  /**
   * 查找关闭按钮并点击
   */
  function findCloseButtonAndClick (defaultBtnPoint) {
    const closeBtnBase64 = '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'
    let point = null
    if (point = openCvUtil.findByGrayBase64(captureScreen(), closeBtnBase64)) {
      LogFloaty.pushLog('使用opencv和灰度图片找到关闭按钮')
      automator.clickPointRandom(point.centerX(), point.centerY())
    } else if (point = widgetUtils.widgetGetOne('关闭', 1000, false, false, m => m.boundsInside(0,  config.device_height * 0.2, config.device_width, config.device_height))) {
      LogFloaty.pushLog('使用文字找到关闭按钮')
      automator.clickRandom(point)
    } else if (defaultBtnPoint) {
      LogFloaty.pushLog('使用默认关闭按钮位置')
      automator.clickPointRandom(defaultBtnPoint.x,defaultBtnPoint.y)
    } else {
      LogFloaty.pushLog('未找到关闭按钮位置，点击空白区域')
      automator.clickPointRandom(config.device_width/4*3, config.device_height * 0.15)
    }
  }

  /**
   * 等待摆摊界面或者好友界面打开完成 寻找邮箱或其他标志物
   */
  function waitForLoading (timeout) {
    if (config._mock_fail && Math.random() > 0.25 || config._fail_next) {
      config._fail_next = true
      return false
    }
    LogFloaty.pushLog('校验是否正确打开蚂蚁新村')
    if (YoloDetection.enabled) {
      if (yoloWaitFor('界面校验', { confidence: 0.7, labelRegex: 'booth_btn|empty_booth|operation_booth|punish_btn|speedup' }, timeout)) {
        return true
      }
    }
    let screen = commonFunctions.captureScreen()
    let findPoint = openCvUtil.findByGrayBase64(screen, villageConfig.checking_mail_box)
    if (!!findPoint) {
      yoloTrainHelper.saveImage(screen, '打开新村成功', 'open_village_success')
      FloatyInstance.setFloatyInfo({ x: findPoint.centerX(), y: findPoint.centerY() }, '打开蚂蚁新村成功')
      sleep(1000)
      return true
    } else {
      yoloTrainHelper.saveImage(screen, '打开新村失败', 'open_village_failed')
      LogFloaty.pushErrorLog('打开蚂蚁新村失败')
      return false
    }
  }

  /**
   * 查找空位，邀请好友摆摊
   */
  function checkAnyEmptyBooth () {
    LogFloaty.pushLog('准备查找是否有超时摊位')
    sleep(1000)
    FloatyInstance.hide()
    if (YoloDetection.enabled) {
      let successCheck = checkAnyEmptyBoothByYolo()
      if (successCheck) {
        return
      } else {
        warnInfo(['检查后 可操作摊位小于2 需要使用OCR方式兜底 可能当前界面无法通过YOLO识别空摊位'])
        yoloTrainHelper.saveImage(commonFunctions.captureScreen(), '无法正确校验空摊位', 'empty_booth')
      }
    }
    let haveDriveOut = false
    let screen = commonFunctions.captureScreen()
    FloatyInstance.restore()
    // 移除超过一定时间的好友摊位
    haveDriveOut |= !!doCheckAndDriveOut(screen, villageConfig.booth_position_left)
    haveDriveOut |= !!doCheckAndDriveOut(screen, villageConfig.booth_position_right)
    if (haveDriveOut) {
      yoloTrainHelper.saveImage(screen, '有可以驱离的好友', 'operation_booth')
      LogFloaty.pushLog('成功驱离了好友的摊位')
      sleep(1000)
    }
    LogFloaty.pushLog('准备查找是否有空位')
    sleep(1000)
    FloatyInstance.hide()
    screen = commonFunctions.captureScreen()
    FloatyInstance.restore()
    let leftEmpty = doCheckEmptyBooth(screen, villageConfig.booth_position_left)
    let noMoreFriend = false
    if (leftEmpty) {
      yoloTrainHelper.saveImage(screen, '左侧有空摊位', 'empty_booth')
      let point = wrapRegionForInvite(villageConfig.booth_position_left)
      FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '左侧有空位')
      sleep(1000)
      if (!inviteFriend(point)) {
        warnInfo('无可邀请好友，不再检查空位')
        automator.clickPointRandom(config.device_width / 2, config.device_height * 0.1)
        noMoreFriend = true
        sleep(1000)
      }
    }
    let rightEmpty = !noMoreFriend && doCheckEmptyBooth(screen, villageConfig.booth_position_right)
    if (rightEmpty) {
      let point = wrapRegionForInvite(villageConfig.booth_position_right)
      FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '右侧有空位')
      yoloTrainHelper.saveImage(screen, '右侧有空位', 'empty_booth')
      sleep(1000)
      inviteFriend(point)
    }
    WarningFloaty.clearAll()
  }

  function checkAnyEmptyBoothByYolo () {
    if (!villageConfig.booth_left_setted || !villageConfig.booth_right_setted) {
      // 检查是否有可驱赶的摊位
      let findOperationBooth = yoloCheckAll('可操作摊位', { labelRegex: 'operation_booth' })
      if (findOperationBooth && findOperationBooth.length > 0) {
        findOperationBooth.forEach(ocrPosition => {
          let boothRegion = [ocrPosition.left, ocrPosition.top, ocrPosition.width, ocrPosition.height].map(v => parseInt(v))
          if (ocrPosition.left < 300 && !villageConfig.booth_left_setted) {
            debugInfo(['设置左侧摊位坐标，原坐标：{}，新坐标：{}',JSON.stringify(villageConfig.booth_position_left), JSON.stringify(boothRegion)])
            villageConfig.booth_left_setted = true
            villageConfig.booth_position_left = boothRegion
            config.overwrite('village.booth_left_setted',true)
            config.overwrite('village.booth_position_left',boothRegion)
          } else if (!villageConfig.booth_right_setted) {
            debugInfo(['设置右侧摊位坐标，原坐标：{}，新坐标：{}',JSON.stringify(villageConfig.booth_position_right), JSON.stringify(boothRegion)])
            villageConfig.booth_right_setted = true
            villageConfig.booth_position_right = boothRegion
            config.overwrite('village.booth_right_setted',true)
            config.overwrite('village.booth_position_right',boothRegion)
          }
        })
      }
    }
    let screen = commonFunctions.captureScreen()
    if (villageConfig.booth_left_setted) {
      doCheckAndDriveOut(screen, villageConfig.booth_position_left)
    }
    if (villageConfig.booth_right_setted) {
      doCheckAndDriveOut(screen, villageConfig.booth_position_right)
    }
    // 检测空摊位并邀请
    let findEmptyBooth = yoloCheckAll('空摊位', { labelRegex: 'empty_booth' })
    if (findEmptyBooth && findEmptyBooth.length > 0) {
      let noMoreFriend = false
      findEmptyBooth.forEach(emptyBooth => {
        if (noMoreFriend) {
          return
        }
        let point = {
          x: emptyBooth.x,
          y: emptyBooth.y,
          centerX: () => emptyBooth.x,
          centerY: () => emptyBooth.y,
        }
        FloatyInstance.setFloatyInfo({ x: point.x, y: point.y }, '有空位点击触发邀请')
        sleep(1000)
        if (!inviteFriend(point)) {
          warnInfo('无可邀请好友，不再检查空位')
          automator.clickPointRandom(config.device_width / 2, config.device_height * 0.1)
          noMoreFriend = true
          sleep(1000)
        }
      })
    }
    // 二次校验可操作摊位 如果小于2 则表示有空摊位无法识别
    findOperationBooth = yoloCheckAll('可操作摊位', { labelRegex: 'operation_booth' })
    return findOperationBooth && findOperationBooth.length >= 2
  }
  function yoloCheck (desc, filter) {
    let result = yoloCheckAll(desc, filter)
    if (result && result.length > 0) {
      return result[0]
    }
    return null
  }

  function yoloCheckAll (desc, filter) {
    let img = null
    let result = []
    let tryTime = 5
    WarningFloaty.clearAll()
    debugInfo(['通过YOLO查找：{} props: {}', desc, JSON.stringify(filter)])
    do {
      sleep(400)
      img = commonFunctions.captureScreen()
      result = YoloDetection.forward(img, filter)
    } while (result.length <= 0 && tryTime-- > 0)
    if (result.length > 0) {
      let hasLowConfidence = false
      let res = result.map(r => {
        let { x: left, y: top, width, height, label, confidence } = r
        debugInfo(['通过YOLO找到目标：{} label: {} confidence: {}', desc, label, confidence])
        if (confidence < 0.9) {
          hasLowConfidence = true
        }
        return { x: left + width / 2, y: top + height / 2, width: width, height: height, left: left, top: top, label: label, confidence: confidence }
      })
      if (hasLowConfidence) {
        yoloTrainHelper.saveImage(img, desc + 'yolo准确率低', 'low' + desc)
      } else {
        yoloTrainHelper.saveImage(img, desc + '成功', desc)
      }
      return res
    } else {
      yoloTrainHelper.saveImage(img, desc + '失败', desc + '_failed')
      debugInfo(['未能通过YOLO找到：{}', desc])
    }
    return null
  }

  function yoloWaitFor (desc, filter, timeout) {
    debugInfo(['通过yolo方式等待界面元素：{}', desc])
    let img = null
    let timeoutCount = timeout? timeout/1000 : 5
    let result = []
    WarningFloaty.clearAll()
    do {
      sleep(1000)
      img = commonFunctions.checkCaptureScreenPermission()
      result = YoloDetection.forward(img, filter)
    } while (result.length <= 0 && timeoutCount-- > 0)
    if (result.length > 0) {
      result.forEach(obj => {
        let { x, y, width, height, label, confidence } = obj
        WarningFloaty.addRectangle('找到：' + desc+label+confidence, [x, y, width, height])
      })
      yoloTrainHelper.saveImage(img, desc + '成功', desc)
    } else {
      yoloTrainHelper.saveImage(img, desc + '失败', desc + '_failed')
    }
    return result.length > 0
  }
  
  /**
   * 校验并驱赶
   * @param {ImageWrapper} screen 
   * @param {array: [left, top, width, height]} region 
   */
  function doCheckAndDriveOut (screen, region) {
    if (!localOcr.enabled) {
      warnInfo('本地Ocr初始化失败 或者当前版本AutoJs不支持Ocr')
      return
    }
    WarningFloaty.addRectangle('OCR识别区域，需要保证点击位置在摊位上', region, '#00ff00')
    let clickPoint = wrapRegionForInvite(region)
    WarningFloaty.addText('点击位置', { x: clickPoint.centerX(), y: clickPoint.centerY() }, '#ff0000')
    let clipImg = images.clip(screen, region[0], region[1], region[2], region[3])
    if (localOcr.type == 'mlkit') {
      // 识别准确率太低 进行放大
      clipImg = images.resize(clipImg, [clipImg.getWidth() * 2, clipImg.getHeight() * 2])
    }
    let recognizeText = localOcr.recognize(clipImg)
    debugInfo(['识别文本：{}', recognizeText])
    recognizeText = recognizeText.replace(/\n/g, '').replace(/ /g, '')
    let regex = new RegExp(villageConfig.friend_end_up_regex || /.*(已停.*|(剩|余).*(经|营).*)/)
    debugInfo(['摊位超时校验正则：{}', '' + regex])
    if (regex.test(recognizeText)) {
      FloatyInstance.setFloatyInfo({ x: region[0], y: region[1] }, '摊位超时：' + recognizeText)
      WarningFloaty.clearAll()
      var r = new org.opencv.core.Rect(region[0], region[1], region[2], region[3])
      automator.clickPointRandom(r.x + r.width / 2, r.y + r.height * 0.2)
      sleep(1000)
      let checking = widgetUtils.widgetWaiting(/.*并请走.*/, null, 3000)
      if (checking) {
        sleep(1000)
        let driveOut = widgetUtils.widgetGetOne('请走TA', 3000)
        if (driveOut) {
          automator.clickRandom(driveOut)
          sleep(3000)
          return true
        }
      } else {
        let pendding = widgetUtils.widgetGetOne('待会再说', 3000)
        if (pendding) {
          automator.clickRandom(pendding)
          sleep(1000)
        }
      }
    } else {
      debugInfo(['未找到超时摊位 区域：{}', JSON.stringify(region)])
      WarningFloaty.clearAll()
      if (/剩余免租/.test(recognizeText)){
        let leftTime = 0
        let leftTimeResult = /(\d+)时(\d+)分/.exec(recognizeText)
        if (leftTimeResult) {
          leftTime = parseInt(leftTimeResult[1]) * 60 + parseInt(leftTimeResult[2])
        } else {
          leftTimeResult = /(\d+)分钟/.exec(recognizeText)
          if (leftTimeResult) {
            leftTime = parseInt(leftTimeResult[1])
          }
        }
        debugInfo(['剩余时间正则校验结果：{}', JSON.stringify(leftTimeResult)])
        if (leftTime>0) {
          _this.nextVisitTime = _this.nextVisitTime ? Math.max(leftTime, _this.nextVisitTime) : leftTime
        }
      }
  }
    return false
  }


  /**
   * 校验指定区域是否有空摊位
   * @param {ImageWrapper} screen 
   * @param {array: [left, top, width, height]} region 
   */
  function doCheckEmptyBooth (screen, region) {
    if (!localOcr.enabled) {
      warnInfo('本地Ocr初始化失败 或者当前版本AutoJs不支持Ocr')
      return
    }
    WarningFloaty.addRectangle('OCR识别区域，需要保证点击位置在摊位上', region, '#00ff00')
    let clickPoint = wrapRegionForInvite(region)
    WarningFloaty.addText('点击位置', { x: clickPoint.centerX, y: clickPoint.centerY }, '#ff0000')
    let clipImg = images.clip(screen, region[0], region[1], region[2], region[3])
    if (localOcr.type == 'mlkit') {
      // 识别准确率太低 进行放大
      clipImg = images.resize(clipImg, [clipImg.getWidth() * 2, clipImg.getHeight() * 2])
    }
    let recognizeText = localOcr.recognize(clipImg)
    debugInfo(['识别文本：{}', recognizeText])
    let regex = new RegExp(/(.*的.*摊.*)|(剩余|免租|经营)/)
    debugInfo(['摊位存在校验正则：{}', '' + regex])
    if (regex.test(recognizeText)) {
      FloatyInstance.setFloatyInfo({ x: region[0], y: region[1] }, '存在摊位：' + recognizeText)
      sleep(1000)
      WarningFloaty.clearAll()
      return false
    } else {
      FloatyInstance.setFloatyInfo({ x: region[0], y: region[1] }, '不存在摊位：' + recognizeText)
      sleep(1000)
      WarningFloaty.clearAll()
      return true
    }
  }

  /**
   * 对OCR识别区域进行封装，点击偏上的位置
   *
   * @param {Array} region 
   * @returns 
   */
  function wrapRegionForInvite (region) {
    var r = new org.opencv.core.Rect(region[0], region[1], region[2], region[3])
    return {
      centerX: () => r.x + r.width / 2,
      centerY: () => r.y + r.height * 0.2
    }
  }

  /**
   * 邀请好友
   * 
   * @param {object} matchResult 
   */
  function inviteFriend (matchResult) {
    FloatyInstance.setFloatyInfo({ x: matchResult.centerX(), y: matchResult.centerY() }, '邀请好友')
    sleep(1000)
    automator.clickPointRandom(matchResult.centerX(), matchResult.centerY())
    sleep(2000)
    let enterInviteView = widgetUtils.widgetWaiting('邀请.*摆摊', null, 3000)
    if (!enterInviteView) {
      warnInfo('未找到好友邀请界面')
      findCloseButtonAndClick()
      return
    }
    
    let invited = false
    do {
      let avatarList = widgetUtils.widgetGetAll('avatar', villageConfig.friends_finding_timeout || 3000, false, m => m.boundsInside(0,0,config.device_width,config.device_height-10), { algorithm: 'PVDFS' })
      if (avatarList && avatarList.length > 0) {
        avatarList.forEach(avatar => {
          if (invited) {
            return
          }
          let index = avatar.indexInParent()
          if (avatar.parent().childCount() <= index + 3) {
            return
          }
          let nameWidget = avatar.parent().child(index + 1)
            let name = nameWidget.desc() || nameWidget.text()
          let inviteBtnContainer = avatar.parent().child(index + 3)
          let inviteBtn = null
          if (inviteBtnContainer.childCount() > 0) {
            inviteBtn = inviteBtnContainer.child(0)
          } else {
            inviteBtnContainer = avatar.parent().child(index + 2)
            if (inviteBtnContainer.childCount() > 0) {
              inviteBtn = inviteBtnContainer.child(0)
            }
          }
          let inviteText = inviteBtn.text() || inviteBtn.desc()
          if (inviteText !== '直接邀请摆摊') {
            debugInfo(['好友：[{}] 不能邀请：{}', name, inviteText])
            return
          }
          if (typeof villageConfig != 'undefined' && villageConfig.booth_black_list && villageConfig.booth_black_list.length > 0) {
            if (villageConfig.booth_black_list.indexOf(name) > -1) {
              debugInfo(['{} 在黑名单中 跳过邀请', name])
              return
            }
          }
          debugInfo(['邀请好友「{}」', name])
          // automator.clickRandom(inviteBtn)
          inviteBtn.click()
          sleep(1000)
          invited = true
        })
      } 
      if (!invited) {
        if (!widgetUtils.widgetCheck('直接邀请摆摊', 1000)) {
          warnInfo('无可邀请好友', true)
          break
        } else {
          randomScrollDown()
          sleep(2000)
        }
      }
    } while (!invited)
    
    return invited
  }

  /**
   * 检查我的摊位
   * 
   * 1 回收超过2小时的摊位
   * 2 将闲置摊位进行摆放
   */
  function checkMyBooth () {
    let point = null, screen = null
    if (YoloDetection.enabled) {
      let result = yoloCheck('摆摊赚币', { confidence: 0.7, labelRegex: 'booth_btn' })
      if (result) {
        point = {
          centerX: () => result.x,
          centerY: () => result.y
        }
      }
    }
    if (!point) {
      screen = commonFunctions.captureScreen()
      point = openCvUtil.findByGrayBase64(screen, villageConfig.my_booth)
    }
    if (!point) {
      debugInfo(['尝试OCR识别 摆摊赚币'])
      let ocrResult = localOcr.recognizeWithBounds(screen, null, '摆摊赚币')
      if (ocrResult && ocrResult.length > 0) {
        point = ocrResult[0].bounds
      }
    }
    if (point) {
      yoloTrainHelper.saveImage(screen, '有摆摊赚币按钮', 'booth_btn')
      FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '找到了摆摊赚币按钮')
      sleep(500)
      // automator.clickPointRandom(point.centerX(), point.centerY())
      automator.click(point.centerX(), point.centerY())
      sleep(1000)
      widgetUtils.widgetWaiting('随机摆摊', null, 3000)
      sleep(500)
      recycleBoothIfNeeded()
      sleep(500)
      setupBooth()
      sleep(1000)
      findCloseButtonAndClick()
    } else {
      warnInfo('未找到摆摊赚币', true)
    }
  }

  /**
   * 回收超过2小时的摊位
   */
  function recycleBoothIfNeeded () {
    LogFloaty.pushLog('查找超过2小时或已停产的摊位')
    let over2 = /[2-6]时(\d+)分/
    let stopped = /已停产/
    let checkResult = widgetUtils.alternativeWidget(over2, stopped, null, true)
    if (checkResult.value == 0) {
      LogFloaty.pushLog('无超过2小时或已停产的摊位')
      sleep(1000)
      return
    } else if (checkResult.value == 1) {
      logInfo('找到了超过2小时的摊位')
    } else if (checkResult.value == 2) {
      logInfo('找到了已停产的摊位')
    }
    doRecycleBooth(widgetUtils.widgetGetOne('全部收摊'))
  }

  function doRecycleBooth (collector) {
    if (!collector) {
      return
    }
    collector.click()
    sleep(500)
    let confirm = widgetUtils.widgetGetOne('确认收摊')
    if (confirm) {
      automator.clickRandom(confirm)
      _this.visited_friends.length = 0
      sleep(1000)
    }
  }

  /**
   * 闲置摊位摆放
   */
  function setupBooth () {
    if (villageConfig.setup_by_income_weight) {
      let button = widgetUtils.widgetGetOne('去摆摊')
      if (button) {
        button.click()
        checkFriendsVillage()
      }
    } else {
      // 随机摆摊
      LogFloaty.pushLog('查找随机摆摊')
      let randomSetup = widgetUtils.widgetGetOne('随机摆摊')
      if (randomSetup) {
        sleep(1000)
        automator.clickRandom(randomSetup)
      }
    }
  }

  /**
   * 检查好友列表 点击有空位的位置
   * TODO 按收益优先级排序
   */
  function checkFriendsVillage () {
    widgetUtils.widgetWaiting('.*木兰币生产速度会更快.*', null, 3000)
    LogFloaty.pushLog('查找空位')
    sleep(1000)
    let incomeRateList = widgetUtils.widgetGetAll(/\d+\/时/, villageConfig.friends_finding_timeout || 8000, false, null, { algorighm: 'PDFS' })
    let blackList = villageConfig.booth_black_list || []
    let noValidBooth = true
    if (incomeRateList && incomeRateList.length > 0) {
      debugInfo(['找到带收益数据数量:{}', incomeRateList.length])
      let validFriendList = incomeRateList.map(incomeRate => {
        let container = incomeRate.parent()
        let friendName = container.child(1).text()
        let nameContainerWidth = container.child(1).bounds().width()
        let parentWidth = container.bounds().width()
        let widthRate = nameContainerWidth / parentWidth
        debugInfo(['名称控件宽度占比：{}', widthRate.toFixed(2)])
        let incomeRateWeight = parseInt(/(\d+)\/时/.exec(incomeRate.text())[1])
        return {
          valid: _this.visited_friends.indexOf(friendName) < 0 && widthRate < 0.6 && (incomeRate.indexInParent() == 4 || incomeRate.indexInParent() == 2),
          container: container,
          friendName: friendName,
          weight: incomeRateWeight
        }
      }).sort((a, b) => b.weight - a.weight).filter(v => v.valid && blackList.indexOf(v.friendName) < 0)
      debugInfo(['过滤有效控件信息数：{}', validFriendList.length])
      if (validFriendList.length > 0) {
        noValidBooth = false
        let emptyBooth = validFriendList[0]
        debugInfo(['过滤后选择好友: {} 进行摆摊 每小时：{}', emptyBooth.friendName, emptyBooth.weight])
        emptyBooth.container.click()
        waitForLoading()
        _this.visited_friends.push(emptyBooth.friendName)
        if (setupToEmptyBooth()) {
          return checkFriendsVillage()
        } else {
          logInfo(['摆摊完毕, 摆摊数量：{}', currentBoothSetted], true)
        }
      }
    }
    if (noValidBooth) {
      LogFloaty.pushLog('未找到空位, 五分钟后再试')
      sleep(1000)
      commonFunctions.minimize()
      commonFunctions.setUpAutoStart(5)
      exit()
    }
  }

  /**
   * 判断好友小村里面是否有空位 有则点击摆摊
   * 
   * @returns 是否完成摆摊 是的话继续去下一个好友村庄检测
   */
  function setupToEmptyBooth () {
    FloatyInstance.setFloatyPosition(0, 0)
    let region = null
    if (YoloDetection.enabled) {
      //先看有没有可贴的罚单
      let punishBooth = yoloCheck('贴罚单摊位', { labelRegex: 'punish_booth', confidence: 0.7 })
      if (punishBooth) {
        let { left, top, width, height } = punishBooth
        let punishRegion = [left, top, width, height]
        FloatyInstance.setFloatyInfo({ x: punishRegion[0], y: punishRegion[1] }, '有可贴罚单')
        sleep(1000)
        var r = new org.opencv.core.Rect(punishRegion[0], punishRegion[1], punishRegion[2], punishRegion[3])
        automator.clickPointRandom(r.x + r.width / 2, r.y + r.height * 0.2)
      }
      //再看有没有空位
      let emptyBooth = yoloCheck('空摊位', { labelRegex: 'empty_booth', confidence: 0.7 })
      if (emptyBooth) {
        let { left, top, width, height } = emptyBooth
        region = [left, top, width, height]
      }
    }
    if (!region) {
      if (YoloDetection.enabled) {
        warnInfo('YOLO方式未找到空位，尝试OCR识别')
      }
      let screen = commonFunctions.captureScreen()
      let emptyCheck = doCheckEmptyBooth(screen, villageConfig.booth_position_left)
      if (emptyCheck) {
        region = villageConfig.booth_position_left
      } else {
        emptyCheck = doCheckEmptyBooth(screen, villageConfig.booth_position_right)
        if (emptyCheck) {
          region = villageConfig.booth_position_right
        }
      }
      if (region) {
        yoloTrainHelper.saveImage(screen, '好友界面有空位', 'empty_booth')
      } else {
        yoloTrainHelper.saveImage(screen, '好友界面无空位', 'no_empty_booth')
      }
    }

    if (region) {
      FloatyInstance.setFloatyInfo({ x: region[0], y: region[1] }, '有空位')
      sleep(1000)
      var r = new org.opencv.core.Rect(region[0], region[1], region[2], region[3])
      automator.clickPointRandom(r.x + r.width / 2, r.y + r.height * 0.2)
      widgetUtils.widgetWaiting('收摊|去摆摊', null, 3000)
      sleep(1500)
      return doSetupBooth()
    } else {
      logInfo('无空位', true)
      logInfo(['当前已摆摊数量为：{}', currentBoothSetted])
      if (currentBoothSetted < 4) {
        logInfo(['已摆摊数量小于4 需要重新回到上级进行判断'])
        automator.back()
        sleep(1000)
        checkFriendsVillage()
      }
      return false
    }
  }

  /**
   * 点击我的小摊去摆摊
   * 
   * @returns 是否继续摆摊
   */
  function doSetupBooth () {
    let setupped = widgetUtils.widgetGetAll('收摊', 1000)
    if (setupped) {
      currentBoothSetted = setupped.length
    }
    logInfo('当前已摆摊数量：' + currentBoothSetted)
    let full = currentBoothSetted >= 3

    let setupBtn = widgetUtils.widgetGetOne('去摆摊')
    if (setupBtn) {
      let point = setupBtn.bounds()
      FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '去摆摊')
      sleep(500)
      // automator.clickRandom(setupBtn)
      setupBtn.click()
      currentBoothSetted += 1
      sleep(500)
      automator.back()
      return !full
    }
    warnInfo('未能找到去摆摊')
    automator.back()
    return false
  }
  let doneList = []
  /**
   * 加速产币
   */
  this.speedAward = function (force) {
    if (!force && commonFunctions.checkSpeedUpCollected()) {
      debugInfo('今日已经完成加速，不继续查找加速产币 答题等请手动执行')
      // return
    }
    if (clickSpeedAward()) {
      doneList = []
      this.doTaskByText()
      let hadAward = false
      if (doCollectAll()) {
        debugInfo('全部领取点击完毕')
        sleep(1000)
        hadAward = true
      }
      if (!force && !hadAward) {
        debugInfo('已经没有可领取的加速产币了 设置今日不再执行')
        commonFunctions.setSpeedUpCollected()
      }
      // debugInfo(['通过计算点击区域 关闭领取抽屉，如果不能正确关闭，请在设置中指定 加速产币关闭按钮坐标：{}, {}', config.device_width / 2, config.device_height * 0.2])
      // let closeBtnPos = null
      // if (villageConfig.award_close_specific) {
      //   debugInfo(['已指定关闭按钮坐标：{}, {}', villageConfig.award_close_x, villageConfig.award_close_y])
      //   closeBtnPos = {x : villageConfig.award_close_x, y: villageConfig.award_close_y}
      // }
      findCloseButtonAndClick()
      sleep(1000)
    } else {
      LogFloaty.pushLog('未找到加速产币')
      sleep(1000)
    }
    if (!waitForLoading()) {
      LogFloaty.pushLog('等待界面加载失败，尝试重新打开')
      commonFunctions.minimize()
      this.openMyVillage()
    }
  }

  function doCollectAll (hadAward, tryTime) {
    tryTime = tryTime || 1
    if (tryTime >= 7) {
      debugInfo(['检测次数过多，取消查找'])
      return hadAward
    }
    let canCollect = widgetUtils.widgetGetAll('(去)?领取', 3000)
    if (canCollect && canCollect.length > 0) {
      let hasNoVisible = false
      canCollect.forEach((collect, idx) => {
        debugInfo(['{} clickable: {} visible: {} centerClickable {}', idx, collect.clickable(), collect.visibleToUser(), automator.checkCenterClickable(collect)])
        let bounds = collect.bounds()
        debugInfo(['boudsRegion {}', JSON.stringify([bounds.left, bounds.top, bounds.width(), bounds.height()])])
        if (automator.checkCenterClickable(collect) && commonFunctions.isObjectInScreen(collect)) {
          automator.clickRandom(collect)
          sleep(500)
        } else {
          if (automator.checkCenterClickable(collect) && collect.clickable()) {
            collect.click()
          }
          hasNoVisible = true
        }
      })
      if (hasNoVisible) {
        // let startY = config.device_height - config.device_height * 0.15
        // let endY = startY - config.device_height * 0.3
        // automator.gestureDown(startY, endY)
        randomScrollDown()
        debugInfo(['滑动下一页检查'])
        sleep(1000)
        return doCollectAll(true, tryTime + 1)
      }
    }
    return hadAward
  }

  this.reopenAndCheckSpeedAward = function (tryTime) {
    debugInfo(['重新打开新村尝试次数：{}', tryTime])
    commonFunctions.minimize()
    
    tryTime = tryTime || 1
    if (tryTime >= 5) {
      errorInfo('重新打开失败多次，跳过执行重新打开', true)
      return
    }
    LogFloaty.pushLog('重新打开新村触发领取')
    if (this.openMyVillage()) {
      return this.speedAward()
    } else {
      LogFloaty.pushLog('重新打开新村失败，关闭支付宝再打开')
      sleep(1000)
      // TODO 更完善的关闭方式
      killAlipay()
      sleep(3000)
      if (tryTime >= 3) {
        LogFloaty.pushWarningLog('重新打开失败多次，多等待一会儿')
        device.keepScreenOn()
        sleep(10000 + tryTime * 2000)
        device.cancelKeepingAwake()
      }
      return this.reopenAndCheckSpeedAward(tryTime + 1)
    }
  }

  function killAlipay (rekill) {
    // app.startActivity({
    //   packageName: "com.eg.android.AlipayGphone",
    //   action: "android.settings.APPLICATION_DETAILS_SETTINGS",
    //   data: "package:com.eg.android.AlipayGphone"
    // });
    // LogFloaty.pushLog('等待进入设置界面加载')
    // let killed = false
    // sleep(1000)
    // let stop = widgetUtils.widgetWaiting('(结束运行)|(强行停止)', null, 3800)
    // if (stop) {
    //   sleep(1000)
    //   stop = widgetUtils.widgetGetOne('(结束运行)|(强行停止)')
    //   automator.clickRandom(stop)
    //   sleep(1000)
    //   let confirm = widgetUtils.widgetGetOne('(确定)|(强行停止)')
    //   if (confirm) {
    //     automator.clickRandom(confirm)
    //     killed = true
    //   }
    // } else {
    //   LogFloaty.pushWarningLog('未能找到结束运行，通过设置关闭支付宝失败')
    // }
    // if (!killed && !rekill) {
    //   LogFloaty.pushLog('未能通过设置界面关闭，采用手势关闭')
    //   config.killAppWithGesture = true
    //   commonFunctions.killCurrentApp()
    //   killAlipay(true)
    // }
    commonFunctions.minimize()
  }

  function clickSpeedAward () {
    if (YoloDetection.enabled) {
      let speedupBtn = yoloCheck('加速产币', { confidence: 0.7, labelRegex: 'speedup' })
      if (speedupBtn) {
        automator.clickPointRandom(speedupBtn.x, speedupBtn.y)
        sleep(3000)
        return true
      }
    }

    let screen = commonFunctions.captureScreen()
    let point = openCvUtil.findByGrayBase64(screen, villageConfig.speed_award)
    if (!point && localOcr.enabled) {
      debugInfo(['尝试OCR识别 加速产币'])
      let ocrResult = localOcr.recognizeWithBounds(screen, [0,config.device_height/5*4,config.device_width,config.device_height/5], '加速产币')
      if (ocrResult && ocrResult.length > 0) {
        point = ocrResult[0].bounds
      }
    }
    if (point) {
      yoloTrainHelper.saveImage(screen, '有加速产币', 'village_speedup')
      FloatyInstance.setFloatyInfo({ x: point.centerX(), y: point.centerY() }, '加速产币')
      sleep(1000)
      automator.clickPointRandom(point.centerX(), point.centerY())
      sleep(3000)
      return true
    }
  }

  /**
   * 获取当前界面是否在项目界面
   */
  this.isInProjectUI = function (projectCode, timeout) {
    timeout = timeout || 2000
    return waitForLoading(timeout)
  }

  /**
   * 获取当前界面是否在任务界面
   */
  this.isInTaskUI = function (projectCode, timeout) {
    timeout = timeout || 2000
    return widgetUtils.widgetWaiting('当前产速.*', '任务列表', timeout)
  }

  this.startApp = function (projectCode) {
    return this.openMyVillage()
  }

  this.openTaskWindow = function (projectCode) {
    return clickSpeedAward()
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

      widgetUtils.widgetWaiting('题目来源.*')
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

  this.doPlayGame = function (titleObj,entryBtn) {
    let result = false
    if (entryBtn) {
      LogFloaty.pushLog('等待进入 '+titleObj.text())
      entryBtn.click()
      sleep(5000);

      playBtn = widgetUtils.widgetGetOne('去玩')
      if (playBtn) {
        LogFloaty.pushLog('点击去玩')
        automator.clickRandom(playBtn)
        sleep(5000)
        if (automator.clickClose()) {
          LogFloaty.pushLog('关闭游戏')
        } else {
          LogFloaty.pushWarningLog('未找到关闭游戏按钮')
        }
        result = true
      }

      automator.back()
      sleep(1000)
    }
    return result
  }

  let randomTop = {start:config.device_height/2-50, end:config.device_height/2+50}
  let randomBottom= {start:config.device_height * 0.85 - 50, end:config.device_height * 0.85 + 50}

  function randomScrollDown () {
    automator.randomScrollDown(randomBottom.start, randomBottom.end, randomTop.start, randomTop.end)
  }

  function randomScrollUp (isFast) {
    automator.randomScrollUp(randomTop.start, randomTop.end, randomBottom.start, randomBottom.end,isFast)
  }

  function scrollUpTop () {
    let limit = 3
    do {
      randomScrollUp(true)
    } while (limit-- > 0)
  }

  this.doTaskByText = function () {
    LogFloaty.pushLog('执行每日任务')

    let taskUITop = {start:config.device_height/2-50, end:config.device_height/2+50}
    let taskUIBottom= {start:config.device_height * 0.85 - 50, end:config.device_height * 0.85 + 50}
    let taskProcess = widgetUtils.widgetGetOne('任务进度轨道')
    if (taskProcess) {
      taskUITop = {start:taskProcess.bounds().top-50, end:taskProcess.bounds().bottom+50}
      debugInfo('任务进度轨道位置：'+taskUITop.start+'~'+taskUITop.end)
    }

    let limit = 3  
    while (limit-- > 0) {
      automator.randomScrollDown(taskUIBottom.start, taskUIBottom.end, taskUITop.start, taskUITop.end)
      sleep(1000)
    }
  
    let taskInfos = [
      {btnRegex:'去完成', tasks:[
        {taskType:'disable',titleRegex:'邀请好友.*'},
        {taskType:'answerQuestion',titleRegex:'职业小知识问答'},
        {taskType:'browse',titleRegex:'.*木兰市集.*',timeout:30,needScroll:true},
        {taskType:'browse',titleRegex:'.*蚂蚁庄园',timeout:5,needScroll:false},
        {taskType:'doPlayGame',titleRegex:'.*去玩解压小游戏'},
        {taskType:'browse',titleRegex:'.*支付宝.*',timeout:5,needScroll:false},
        {taskType:'browse',titleRegex:'.*农货.*',timeout:15,needScroll:true},
        {taskType:'browse',titleRegex:'.*芝麻.*',timeout:5,needScroll:false},

        {taskType:'app',titleRegex:'.*天猫.*',timeout:15,needScroll:true},
        {taskType:'app',titleRegex:'.*点淘.*',timeout:20,needScroll:false},
        {taskType:'app',titleRegex:'.*淘宝.*',timeout:15,needScroll:false},
        {taskType:'app',titleRegex:'.*高德.*',timeout:15,needScroll:false},
        {taskType:'app',titleRegex:'.*饿了么.*',timeout:10,needScroll:false},
      ]},
    ]
 
    taskUtil.initProject(this,'village')
    taskUtil.doTasks(taskInfos)

    limit = 3  
    while (limit-- > 0) {
      automator.randomScrollUp(taskUITop.start, taskUITop.end, taskUIBottom.start, taskUIBottom.end,true)
      sleep(1000)
    }
  }

  // this.speedAward = speedAward
  this.waitForLoading = waitForLoading
  // this.doTask = doTask
  this.killAlipay = killAlipay
}

module.exports = new VillageRunner()
