let { config } = require('../config.js')(runtime, this)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, this)

let _runningQueueDispatcher = singletonRequire('RunningQueueDispatcher')
let _commonFunctions = singletonRequire('CommonFunction')
let alipayUnlocker = singletonRequire('AlipayUnlocker')
let widgetUtils = singletonRequire('WidgetUtils')
let WarningFloaty = singletonRequire('WarningFloaty')
let LogFloaty = singletonRequire('LogFloaty')
let { logInfo, errorInfo, warnInfo, debugInfo, infoLog } = singletonRequire('LogUtils')
let _FloatyInstance = singletonRequire('FloatyUtil')
let yoloTrainHelper = singletonRequire('YoloTrainHelper')
let YoloDetection = singletonRequire('YoloDetectionUtil')
let NotificationHelper = singletonRequire('Notification')
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
  this.isKeepAlive = false

  this.setKeepAlive = function () {
    this.isKeepAlive = true
  }

  this.setFloatyTextColor = function (colorStr) {
    _FloatyInstance.setFloatyTextColor(colorStr)
  }

  this.setFloatyInfo = function (position, text) {
    debugInfo(['设置悬浮窗位置: {} 内容: {}', JSON.stringify(position), text])
    _FloatyInstance.setFloatyInfo(position, text)
  }

  this.launchApp = function (reopen, keepAlive) {
    debugInfo(['尝试打开支付宝，参数: {}', JSON.stringify(reopen)])
    _commonFunctions.backHomeIfInVideoPackage()
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
        return this.launchApp(true, keepAlive)
      }
    
      if (config.is_alipay_locked) {
        sleep(1000)
        alipayUnlocker.unlockAlipay()
      }
  
      sleep(1000)
      if (this.waitForOwn(keepAlive)) {
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
      yoloTrainHelper.saveImage(img, desc + '失败', desc, config.yolo_save_check_failed)
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
      yoloTrainHelper.saveImage(img, desc + '失败', desc, config.yolo_save_check_failed)
    }
    return result.length > 0
  }

  /**
   * yolo查找所有匹配的对象
   * @param {string} desc 描述信息
   * @param {object} filter 过滤配置 可信度 label 等等
   * @return {array}
   */
  this.yoloCheckAll = function (desc, filter) {
    let img = null
    let results = []
    let tryTime = 5

    WarningFloaty.clearAll()
    debugInfo(['通过YOLO查找：{} props: {}', desc, JSON.stringify(filter)])
    do {
      sleep(400)
      img = _commonFunctions.captureScreen()
      results = YoloDetection.forward(img, filter)
    } while (results.length <= 0 && tryTime-- > 0)
    if (results.length > 0) {
      results.sort((a, b) => b.confidence - a.confidence)
      img = _commonFunctions.captureScreen()
      return results.map(result => {
        let { x, y, width, height, label, confidence } = result
        let left = x, top = y
        WarningFloaty.addRectangle('找到：' + desc, [left, top, width, height])
        debugInfo(['通过YOLO找到目标：{} label: {} confidence: {}', desc, label, confidence])
        if (confidence < 0.9) {
          yoloTrainHelper.saveImage(img, desc + 'yolo准确率低', 'low_predict', config.yolo_save_low_predict)
        }
        return { x: left + width / 2, y: top + height / 2, width: width, height: height, left: left, top: top, label: label }
      })
    } else {
      debugInfo(['未能通过YOLO找到：{}', desc])
      yoloTrainHelper.saveImage(img, 'yolo查找失败' + desc, config.yolo_save_check_failed)
    }
    return null
  }

  this.yoloCheck = function (desc, filter, index) {
    index = index || 0
    
    let results = this.yoloCheckAll(desc, filter)
    if (results && results.length > index) {
      return results[index]
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
    if (typeof keepAlive == 'undefined') {
      keepAlive = this.isKeepAlive 
    }
    let findColor = false
    let limit = 2
    do {
      if (YoloDetection.enabled) {
        findColor = this.yoloWaitFor('领饲料|喂食按钮', { confidence: 0.7, labelRegex: 'collect_food|feed_btn' })
      } else {
        findColor = this.waitFor(config.CHECK_APP_COLOR, config.CHECK_APP_REGION, null, '小鸡主界面')
      }
      if (findColor) {
        this.setFloatyInfo(null, CONTENT.personal_home + '成功')
        return true
      } else {
        this.setFloatyInfo(null, '检测失败，尝试OCR识别')
        if (this.checkByOcr([0, 0, config.device_width * 0.2, config.device_height / 2], '捐蛋反馈|开心飞起|小鸡日记|AI传话')) {
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
    this.closeDialogIfExistByYolo()
    return false
  }

  this.closeDialogIfExistByYolo = function () {
    if (!YoloDetection.enabled) {
      return
    }
    let findTarget = this.yoloCheck('关闭弹窗', { labelRegex: 'close_icon' })
    if (findTarget) {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '关闭弹窗', 'close_icon')
      this.setFloatyInfo(findTarget, '关闭弹窗')
      click(findTarget.x, findTarget.y)
      sleep(1000)
    }
  }


  this.waitForFriends = function () {
    let findColor = false
    if (YoloDetection.enabled) {
      findColor = this.yoloWaitFor('给ta留言|召回', { confidence: 0.7, labelRegex: 'leave_msg|bring_back' })
      if (!findColor) {
        yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '进入好友界面失败', 'friend_home_yolo_failed')
      }
    }
    // 旧代码兜底
    if (!findColor) {
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
      this.pushErrLog('进入好友界面失败 需要重启脚本')
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
    this.pushLog('检查小鸡是否外出')
    if (YoloDetection.enabled) {
      let signboard = this.yoloCheck('标牌', { confidence: 0.7, labelRegex: 'signboard' })
      if (signboard) {
        yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '小鸡外出', 'signboard')
        this.setFloatyInfo(signboard, '小鸡外出不在家')
        this.pushLog('小鸡外出了')
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
        this.pushLog('小鸡外出了')
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
    this.pushLog('小鸡外出 去好友家将它带回')

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
    this.pushLog('检查是否有饭吃')
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
      // 喂鸡后领取饲料
      fodderCollector.exec()
      if (!this.waitForOwn(true)) {
        this.pushErrorLog('打开小鸡页面失败，重新打开')
        this.launchApp(true)
      }
    } else if (ocrRestTime > -1) {
      // 大概情况就是上一次执行喂食后加速卡用完了 导致OCR识别失败 以上机制懒得修改了 先这么适配
      let feedPassedTime = _commonFunctions.getFeedPassedTime()
      if (feedPassedTime < 20 && _commonFunctions.getSleepStorage().runningCycleTime < 0
        // 已记录的喂食周期比当前OCR识别的时间还短，不正常 需要重新记录
        || _commonFunctions.getSleepStorage().runningCycleTime - ocrRestTime <= 0) {
        _commonFunctions.updateSleepTime(20 - feedPassedTime, false, ocrRestTime + feedPassedTime)
      }
    }
    let sleepTime = _commonFunctions.getSleepTimeByOcr(ocrRestTime)
    this.setFloatyInfo(null, sleepTime + '分钟后来检查状况')
    this.pushLog(sleepTime + '分钟后来检查状况')
    _commonFunctions.setUpAutoStart(sleepTime)
  }

  this.doFeed = function () {
    let img = null
    let feed = false
    this.pushLog('检查小鸡是否有饭吃')
    if (YoloDetection.enabled) {
      let checkHasOrNoFood = this.yoloCheck('校验有饭吃', { confidence: 0.9, labelRegex: 'has_food|no_food' })
      img = _commonFunctions.checkCaptureScreenPermission()
      if (checkHasOrNoFood && checkHasOrNoFood.label == 'has_food') {
        config.COUNT_DOWN_REGION = [checkHasOrNoFood.left, checkHasOrNoFood.top - 100, checkHasOrNoFood.width + 30, 100]
        yoloTrainHelper.saveImage(img, '小鸡有饭吃', 'eating_chicken')
        this.setFloatyInfo(checkHasOrNoFood, '小鸡有饭吃哦')
        this.pushLog('小鸡有饭吃')
      } else {
        yoloTrainHelper.saveImage(img, '小鸡没饭吃', 'hungry_chicken')
        this.pushLog('小鸡没饭吃')
        let feedBtn = this.yoloCheck('喂饭按钮', { confidence: 0.7, labelRegex: 'feed_btn' })
        if (feedBtn) {
          let foodCount = 0
          let targetBd = null

          let feedExpand = this.yoloCheck('展开喂饭', { confidence: 0.7, labelRegex: 'feed_expand' })
          if (!feedExpand) {
            //OCR检查是否需要展开
            let region = [feedBtn.x - feedBtn.width / 2, feedBtn.y - feedBtn.height / 2, feedBtn.width, feedBtn.height]
            let results = localOcr.recognizeWithBounds(_commonFunctions.captureScreen(), region, /\d+g/)
            if (!results || results.length == 0) {
              feedExpand = {x:feedBtn.x, y:feedBtn.top - 20, width:feedBtn.width}
              yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '无法找到展开饲料', 'feed_expand_failed')
            } else {
              foodCount = results[0].label
              targetBd = results[0].bounds
            }
          }
          if (feedExpand) {
            this.setFloatyInfo(feedExpand, '展开喂饭')
            click(feedExpand.x, feedExpand.y)
            sleep(2000)
            yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '饲料展开', 'feed_expanded')
            // TODO 训练展开后的饲料按钮
            let region = [feedExpand.x - feedExpand.width / 2, feedExpand.y - 700, feedExpand.width, 700]
            let results = localOcr.recognizeWithBounds(_commonFunctions.captureScreen(), region, /\d+g/)
            if (results && results.length > 0) {
              foodCount = results[0].label
              targetBd = results[0].bounds
            }
          }
          if (targetBd) {
            let target = {
              x: targetBd.centerX(),
              y: targetBd.centerY()
            }
            let { left, top } = targetBd
            let width = targetBd.width()
            let height = targetBd.height()
            WarningFloaty.addRectangle('饲料数量：' + foodCount, [left, top, width, height])
            click(target.x, target.y)
            feed = true
            sleep(1000)
            this._had_feed = true
          } else {
            this.pushErrorLog('OCR查找饲料位置失败 无法执行饲料展开后的投喂操作')
          }
          if (!feed) {
            // 执行喂饭
            click(feedBtn.x, feedBtn.y)
            feed = true
          }
        } else {
          _FloatyInstance.setFloatyText('未找到喂饭按钮')
          this.pushErrorLog('未找到喂饭按钮')
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
    if (retryTime >= 3) {
      return false
    }
    if (retryTime > 1) {
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '重试喂食第' + retryTime + '次', 'feed_failed_too_much', true)
    }
    if (this.doFeed()) {
      sleep(1000)
      return this.checkFeedSuccess(retryTime + 1)
    }
  }

  /**
   * 使用加速卡
   */
  this.useSpeedCard = function () {
    this.pushLog('准备使用加速卡')
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
    let skipUse = false, top = config.device_height * 0.3
    if (speedupCard) {
      let target = widgetUtils.widgetGetOne('喂食后可同时使用多张.*', 2000)
      if (target) {
        let container = target.parent().parent()
        WarningFloaty.addRectangle('加速卡区域', boundsToRegion(container.bounds()), '#00ff00')
        let numWidget = widgetUtils.subWidgetGetOne(container, /\d\/\d+/, 2000)
        if (numWidget) {
          WarningFloaty.addRectangle('加速卡数量：' + numWidget.text(), boundsToRegion(numWidget.bounds()), '#00ff00')
          if (/0\/20/.test(numWidget.text())) {
            top = numWidget.bounds().top - 650 * config.scaleRate
            warnInfo('加速卡已经使用完，无法继续使用')
            debugInfo(['点击关闭，位置：{},{}', config.device_width, top])
            automator.click(config.device_width / 2, top)
            skipUse = true
          }
        }
        sleep(1000)
      } else {
        warnInfo(['无法找到加速卡区域'])
      }
      WarningFloaty.clearAll()
      if (!skipUse) {
        automator.clickCenter(speedupCard)
        sleep(1000)
        let confirmUsing = widgetUtils.widgetGetOne('立即加速', 2000)
        if (!confirmUsing) {
          warnInfo(['未找到使用按钮，可能是加速卡用完了'])
          this.pushErrorLog('未找到加速按钮 可能加速卡用完了')
        } else {
          this.pushLog('点击使用加速卡：立即加速')
          automator.clickCenter(confirmUsing)
          sleep(1000)
          let closeIcon = className('android.widget.TextView').depth(18).clickable(true).findOne(1000)
          if (closeIcon) {
            yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '关闭按钮', 'close_icon')
            debugInfo(['通过控件关闭弹窗 {}', closeIcon.click()])
          } else {
            warnInfo('通过控件查找关闭按钮失败')
            yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '关闭按钮失败', 'close_icon_failed')
          }
        }
        sleep(1000)
        let closeIcon = this.yoloCheck('关闭按钮', { labelRegex: 'close_icon' })
        if (closeIcon) {
          click(closeIcon.x, closeIcon.y)
        } else {
          automator.back()
        }
      }
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
  
  /**
   * 处理道早安操作
   * @param {object} actionBtn OCR识别结果 包含bounds信息
   * @returns {boolean} 是否成功执行
   */
  this.handleSayMorning = function (actionBtn) {
    _FloatyInstance.setFloatyText('发现早安按钮, 道早安')
    automator.clickPointRandom(actionBtn.bounds.centerX(), actionBtn.bounds.centerY())
    sleep(1000)
    let confirmBtn = widgetUtils.widgetGetOne('确认发送', 2000)
    if (confirmBtn) {
      automator.clickRandom(confirmBtn)
      sleep(1000)
      let closeBtn = widgetUtils.widgetGetOne('复制口令邀请.*', 2000)
      closeBtn = closeBtn ? (closeBtn.parent() ? closeBtn.parent().parent().child(2) : null) : null
      if (closeBtn) {
        automator.clickRandom(closeBtn)
        sleep(1000)
      }
      return true
    }
    return false
  }

  /**
   * 处理帮喂食操作
   * @param {object} actionBtn OCR识别结果 包含bounds信息
   * @returns {boolean} 是否成功执行
   */
  this.handleFeedFamily = function (actionBtn) {
    _FloatyInstance.setFloatyText('发现喂食按钮，帮喂食')
    automator.clickPointRandom(actionBtn.bounds.centerX(), actionBtn.bounds.centerY())
    sleep(1000)
    
    let confirmBtn = widgetUtils.widgetGetOne('^确认.*$',2000)
    if (confirmBtn) {
      automator.clickRandom(confirmBtn)
      sleep(1000)
      return true
    }
    return false
  }

  /**
   * 处理去指派操作
   * @param {object} actionBtn OCR识别结果 包含bounds信息
   * @returns {boolean} 是否成功执行
   */
  this.handleInviteToWork = function (actionBtn) {
    _FloatyInstance.setFloatyText('发现指派按钮，去指派')
    automator.clickPointRandom(actionBtn.bounds.centerX(), actionBtn.bounds.centerY())
    sleep(1000)

    let confirmBtn = widgetUtils.widgetGetOne('^确认$',2000)
    if (confirmBtn) {
      automator.clickRandom(confirmBtn)
      sleep(1000)
      return true
    }
    return false
  }

  /**
   * 处理去请客操作
   * @param {object} actionBtn OCR识别结果 包含bounds信息
   * @returns {boolean} 是否成功执行
   */
  this.handleInviteToEat = function (actionBtn) {
    _FloatyInstance.setFloatyText('发现请客按钮，请客吃饭')
    let eatClickPoint = [config.device_width / 2, actionBtn.bounds.bottom + 100]
    automator.clickPointRandom(eatClickPoint[0], eatClickPoint[1])
    sleep(1000)
    
    let luckyBtn = widgetUtils.widgetGetOne('.*抽奖得美食', 2000)
    if (luckyBtn) {
      let foodItems = widgetUtils.widgetGetAll('.*美食不足.*', 2000)
      let needFoodNum = foodItems ? foodItems.length : 0
      if (needFoodNum > 0) {
        debugInfo('美食不足，需要' + needFoodNum + '个')
        // 进入抽奖界面获取美食
        automator.clickRandom(luckyBtn)
        sleep(2000)
        
        // 循环抽奖直到满足需求
        while (needFoodNum > 0) {
          let drawResult = this.luckyDraw()
          if (!drawResult) break
          let [drawTimes, , luckyItemNum, luckyItemType] = drawResult
          if (luckyItemType == '份') {
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

        // 关闭并重新打开请客界面
        luckyBtn = widgetUtils.widgetGetOne('.*抽奖得美食', 2000)
        if (luckyBtn) {
          let closeBtn = luckyBtn.parent() ? luckyBtn.parent().child(luckyBtn.indexInParent() + 1) : null
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
    }

    let confirmBtn = widgetUtils.widgetGetOne('^确认$', 2000)
    if (confirmBtn) {
      automator.clickRandom(confirmBtn)
      sleep(1000)
      return true
    }
    return false
  }

  /**
   * 处理攒亲密度操作
   * @param {object} signBtn OCR识别结果 包含bounds信息
   * @returns {boolean} 是否成功执行
   */
  this.handleMoreAction = function (signBtn) {
    let nextBtn = null
    let actionTtile = null

    //分享活动处理
    actionTtile = widgetUtils.widgetGetOne('给好友分享一次活动\\(0/1\\).*',2000)
    if (actionTtile) {
      let actionBtn = actionTtile.parent().child(actionTtile.indexInParent() + 1)
      if (actionBtn) {
        automator.clickRandom(actionBtn)
        nextBtn=widgetUtils.widgetGetOne('分享给Ta们.*',10000)
        if (nextBtn) {
          automator.clickRandom(nextBtn)
          sleep(3000)
        }
      }
    }

    //捐步处理
    actionTtile = widgetUtils.widgetGetOne('一起运动做公益\\(0/1\\).*',2000)
    if (actionTtile) {
      let actionBtn = actionTtile.parent().child(actionTtile.indexInParent() + 1)
      if (actionBtn) {
        automator.clickRandom(actionBtn)
        nextBtn=widgetUtils.widgetGetOne('去捐步数',10000)
        if (nextBtn) {
          automator.clickRandom(nextBtn)
          nextBtn=widgetUtils.widgetGetOne('立即捐步',10000)
          if (nextBtn) {
            automator.clickRandom(nextBtn)
            nextBtn=widgetUtils.widgetGetOne('知道了',10000)
            if (nextBtn) {
              automator.clickRandom(nextBtn)
              sleep(1000)
            }
          }
          automator.back()
          sleep(1000)
        }
        // //重新打开攒亲密度界面
        // automator.clickPointRandom(config.device_width / 2, config.device_height / 4)
        // sleep(1000)
        // automator.clickPointRandom(signBtn.bounds.centerX(), signBtn.bounds.centerY())
        // sleep(1000)
      }
    }

    //关闭攒亲密度界面
    automator.clickPointRandom(config.device_width / 2, config.device_height / 4)
    sleep(1000)

    return true
  }

  /**
   * 执行家庭页面中的动作
   */
  this.doFamily = function () {
    // OCR检查"家庭"并点击
    let familyBtn = this.checkByOcr([0, config.device_height / 4 * 3, config.device_width, config.device_height / 4], '^家庭$')
    if (familyBtn) {
      _FloatyInstance.setFloatyText('点击家庭')
      automator.clickPointRandom(familyBtn.bounds.centerX(), familyBtn.bounds.centerY() - 20)
      if (!_commonFunctions.waitForAction(20, '进入家庭界面', () => {
        return this.checkByOcr([0, config.device_height / 4 * 3, config.device_width / 2, config.device_height / 4], '^家庭管理$')
      })) {
        return
      }
    } else {
      return
    }

    // 循环执行道早安和请客动作
    let actionRegex = /^道早安|去请客|去指派$/
    let region = [0, config.device_height / 3, config.device_width, config.device_height / 3]
    while (true) {
      let actionBtn = this.checkByOcr(region, actionRegex, 2)
      if (!actionBtn) {
        break
      }
      let actionText = actionBtn.label
      let success = false
      switch (actionText) {
        case '道早安':
          success = this.handleSayMorning(actionBtn)
          break
        case '去请客':
          success = this.handleInviteToEat(actionBtn)
          break
        case '去喂食':
          success = this.handleFeedFamily(actionBtn)
          break
        case '去指派':
          success = this.handleInviteToWork(actionBtn)
          break
      }
      // 执行完一个动作后等待5秒
      sleep(10000)
    }

    // 单独检查并处理签到
    let signRegion = [0, config.device_height / 4 * 3, config.device_width, config.device_height / 4]
    let signBtn = this.checkByOcr(signRegion, '^立即签到|.*亲密度$', 1)
    if (signBtn) {
      _FloatyInstance.setFloatyText('发现' + signBtn.label + '按钮，进行签到')
      automator.clickPointRandom(signBtn.bounds.centerX(), signBtn.bounds.centerY())
      sleep(1000)
      this.handleMoreAction(signBtn)
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

  /**
   * Checks if the given region is within the screen bounds
   * @param {array} region The region to check. Format: [left, top, width, height] or null
   * @param {ImageWrapper} screen The screen image to check against
   * @returns {boolean} True if the region is within the screen bounds, false otherwise
   */
  function regionInScreen (region, screen) {
    if (!region) {
      return true
    }
    let width = screen.width, height = screen.height
    let regionL = Math.floor(region[0]), regionT = Math.floor(region[1])
    let regionW = Math.floor(region[2]), regionH = Math.floor(region[3])
    debugInfo(['screen info：{}', JSON.stringify([width, height])])
    debugInfo(['region位置：{} => {}', JSON.stringify(region), JSON.stringify([regionL, regionT, regionW, regionH])])
    if (regionL >= 0 && regionT >= 0 && regionL + regionW <= width && regionT + regionH <= height) {
      return regionW > 0 && regionH > 0
    } else {
      return false
    }
  }

  /**
   * Checks if the given region is within the screen bounds
   * @param {array} region The region to check. Format: [left, top, width, height] or null
   * @param {ImageWrapper} screen The screen image to check against
   * @returns {boolean} True if the region is within the screen bounds, false otherwise
   */
  function regionInScreen (region, screen) {
    if (!region) {
      return true
    }
    let width = screen.width, height = screen.height
    let regionL = Math.floor(region[0]), regionT = Math.floor(region[1])
    let regionW = Math.floor(region[2]), regionH = Math.floor(region[3])
    debugInfo(['screen info：{}', JSON.stringify([width, height])])
    debugInfo(['region位置：{} => {}', JSON.stringify(region), JSON.stringify([regionL, regionT, regionW, regionH])])
    if (regionL >= 0 && regionT >= 0 && regionL + regionW <= width && regionT + regionH <= height) {
      return regionW > 0 && regionH > 0
    } else {
      return false
    }
  }

  this.checkByOcr = function (region, contentRegex, limit) {
    if (!localOcr.enabled) {
      warnInfo(['请至少安装mlkit-ocr插件或者修改版AutoJS获取本地OCR能力'])
      return false
    }
    _FloatyInstance.hide()
    WarningFloaty.disableTip()
    sleep(50)
    try {
      limit = limit || 3
      while (limit-- > 0) {
        let screen = _commonFunctions.checkCaptureScreenPermission()
        if (!regionInScreen(region, screen)) {
          warnInfo(['ocr识别区域不在屏幕内：{} != [{},{}]', JSON.stringify(region), screen.width, screen.height])
          return false
        }
        if (screen) {
          debugInfo(['ocr识别 {} 内容：{}', region ? '区域' + JSON.stringify(region) : '', contentRegex])
          let result = localOcr.recognizeWithBounds(screen, region, contentRegex, true)
          if (result && result.length > 0) {
            return result[0]
          }
        }
        sleep(1000)
      }
      return false
    } finally {
      _FloatyInstance.restore()
      WarningFloaty.enableTip()
    }
  }

  this.prepareChecker = function () {
    this.checker = YoloDetection.enabled ? new YoloChecker(this) : new ColorChecker(this)
  }

  this.collectReadyEgg = function () {
    LogFloaty.pushLog('查找是否存在可收集的鸡蛋')
    let collect = this.yoloCheck('成熟的鸡蛋', { labelRegex: 'collect_egg' })
    if (collect) {
      LogFloaty.pushLog('找到了可收集的鸡蛋')
      automator.click(collect.x, collect.y)
    } else {
      LogFloaty.pushLog('未找到可收集的鸡蛋')
    }
  }

  this.pushLog = function () {
    LogFloaty.pushLog.apply(LogFloaty, arguments)
  }

  this.pushErrorLog = function () {
    LogFloaty.pushErrorLog.apply(LogFloaty, arguments)
  }

  this.start = function () {
    this.prepareChecker()
    if (!this.launchApp()) {
      warnInfo(['打开项目失败，5分钟后重新尝试'])
      _commonFunctions.setUpAutoStart(5)
      return false
    }
    this.pushLog('打开APP成功')
    sleep(1000)
    this.collectReadyEgg()
    if(!this.checkIsSleeping()) {
      this.checkIsOut()
    }
    this.pushLog('检查是否有偷吃野鸡')
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
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '收集饲料按钮', 'collect_muck')
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
  YoloChecker.prototype.driveThief = function (findThief, desc) {
    desc = desc || '找到了野鸡'
    if (findThief) {
      debugInfo(['{}：{},{}', desc, findThief.x, findThief.y])
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
    this.mainExecutor.pushLog('准备校验是否有偷吃野鸡')
    let findThiefLeft = this.mainExecutor.yoloCheck('偷吃野鸡', { confidence: 0.7, labelRegex: 'thief_chicken|thief_eye_band', filter: (result) => result.x < config.device_width / 2 })
    this.driveThief(findThiefLeft) ? kicked = true : (findThiefLeft && workerCount++)
    let findThiefRight = this.mainExecutor.yoloCheck('偷吃野鸡', { confidence: 0.7, labelRegex: 'thief_chicken|thief_eye_band', filter: (result) => result.x > config.device_width / 2 })
    this.driveThief(findThiefRight) ? kicked = true : (findThiefRight && workerCount++)

    let findFoodInCenter = this.mainExecutor.yoloCheck('中间食盆位置', { confidence: 0.7, labelRegex: 'has_food', filter: result => result.x - (result.width / 2) < config.device_width / 2 /* x坐标位置在中心点左边，代表有野鸡存在而yolo识别失败了 */ })
    if (findFoodInCenter && !kicked && (!findThiefLeft || !findThiefRight)) {
      warnInfo(['食盆位置在中间，而野鸡驱赶失败，记录数据'])
      yoloTrainHelper.saveImage(_commonFunctions.captureScreen(), '偷吃野鸡识别失败', 'thief_chicken_check_failed')
      // 左右随便点击一下
      !findThiefLeft && kicked != this.driveThief({ x: findFoodInCenter.x - findFoodInCenter.width, y: findFoodInCenter.y }, '盲点左边野鸡坐标')
      !findThiefRight && kicked != this.driveThief({ x: findFoodInCenter.x + findFoodInCenter.width * 2, y: findFoodInCenter.y }, '盲点右边野鸡坐标')
    }
    if (!kicked) {
      this.mainExecutor.pushLog('未找到偷吃野鸡')
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
      let storage = storages.create("alipay_multi_login")
      let multiLoginFlag = storage.get("flag")
      let multiLoginTime = storage.get("timestamp")
      let currentTime = new Date().getTime()
      let waitMin = 10
      if (!multiLoginFlag) {
        _FloatyInstance.setFloatyText('检测到其他设备登录，' + waitMin + '分钟后重试')
        debugInfo('检测到其他设备登录,记录时间并设置10分钟后重试')
        storage.put("flag", true)
        storage.put("timestamp", currentTime)
        _commonFunctions.setUpAutoStart(waitMin)
        exit()
      } else if (currentTime - multiLoginTime >= waitMin * 60 * 1000) {
        _FloatyInstance.setFloatyText('等待时间已到，点击进入支付宝')
        debugInfo('已等待10分钟,点击进入支付宝')
        automator.clickRandom(entryBtn)
        sleep(1000)
        return true
      } else {
        let remainMinutes = Math.ceil((waitMin * 60 * 1000 - (currentTime - multiLoginTime)) / (60 * 1000))
        _FloatyInstance.setFloatyText('等待时间未到，还需等待' + remainMinutes + '分钟')
        debugInfo('等待时间未到10分钟,设置剩余时间后重试')
        _commonFunctions.setUpAutoStart(remainMinutes)
        exit()
      }
    } else {
      debugInfo(['未找到 进入支付宝 按钮'])
    }
  }
}

function boundsToRegion (b) {
  return [b.left, b.top, b.width(), b.height()]
}