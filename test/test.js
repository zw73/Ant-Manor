let { config } = require('../config.js')(runtime, global)
let singletonRequire = require('../lib/SingletonRequirer.js')(runtime, global)
let commonFunctions = singletonRequire('CommonFunction')
let resourceMonitor = require('../lib/ResourceMonitor.js')(runtime, global)
let widgetUtils = singletonRequire('WidgetUtils')
let automator = singletonRequire('Automator')
let alipayUnlocker = singletonRequire('AlipayUnlocker')
let FileUtils = singletonRequire('FileUtils')
let openCvUtil = require('../lib/OpenCvUtil.js')
let { logInfo, errorInfo, warnInfo, debugInfo, infoLog } = singletonRequire('LogUtils')
let FloatyInstance = singletonRequire('FloatyUtil')
let localOcrUtil = require('../lib/LocalOcrUtil.js')
let WarningFloaty = singletonRequire('WarningFloaty')
let LogFloaty = singletonRequire('LogFloaty')
let yoloTrainHelper = singletonRequire('YoloTrainHelper')
let YoloDetection = singletonRequire('YoloDetectionUtil')
FloatyInstance.init()
FloatyInstance.enableLog()

function test1() {
  let content = 'close_btn'
  let screen = commonFunctions.captureScreen()
  let testImg = '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'
  let collect = openCvUtil.findByImageSimple(images.cvtColor(images.grayscale(screen), 'GRAY2BGRA'), images.fromBase64(testImg))
  if (collect) {
    debugInfo('截图找到了目标：' + content)
    FloatyInstance.setFloatyInfo({
      x: collect.centerX(),
      y: collect.centerY()
    }, '找到了 ' + content)
  } else {
    FloatyInstance.setFloatyInfo({
      x: 300,
      y: 700
    }, '没有找到 ' + content)
  }

}
function test2() {
    //加载图片文件 1724644438136100.jpg
    let img = images.read('../../1724644438136100.jpg')
    //OCR 识别图片，查找文本“一键收”并点击找到的区域
    debugInfo(['尝试ocr识别一键收'])
    let ocrCheck = localOcrUtil.recognizeWithBounds(img, null, '一键收')
    if (ocrCheck && ocrCheck.length > 0) {
      let bounds = ocrCheck[0].bounds
      debugInfo(['识别结果：{}', JSON.stringify(bounds)])
      try {
        debugInfo(['{} {} {} {}', bounds.left, bounds.top, bounds.width(), bounds.height])
      } catch (e) {

      }
      let region = [
        bounds.left, bounds.top,
        bounds.right - bounds.left, bounds.bottom - bounds.top
      ]
      debugInfo(['通过ocr找到了目标：{}', region])
      WarningFloaty.addRectangle('一键收', region)
    } else {
      warnInfo(['无法通过ocr找到一键收，可能当前有活动元素阻断'])
    }
    img.recycle()
}

function test3() {
  debugInfo('开始星星球测试')
  let starBallPlayer = require('../unit/星星球.js')
  starBallPlayer.exec()
}

function test4() {
  debugInfo('开始答题测试')
  let title = widgetUtils.widgetGetOne('氛围',2000)
  let questionRoot = null
  if (title) {
    questionRoot = title.parent()
  }
  let source = 'tbfarm'
  source = source || 'common'
  if (!questionRoot && source=='common') {
    questionRoot = textMatches('题目来源.*').findOne(5000)
    debugInfo(['题目root：{}', questionRoot]) 
    if (questionRoot) {
      questViewIndex = questionRoot.indexInParent() - 1
      debugInfo(['题目index：{}', questViewIndex])
      if (questionRoot.parent() && questViewIndex>=0){
        questionRoot = questionRoot.parent().child(questViewIndex)
      } else {
        questionRoot = null
      }
    }  
  }
  debugInfo(['题目：{}', questionRoot])
  let questionWidget = null
  let answerWidgets = null
  switch (source) {
    case 'tbfarm':
      questionWidget = questionRoot.children().findOne(className('android.widget.TextView'))
      answerWidgets = questionRoot.child(2).children().find(className('android.widget.Button'))
      break;
    default:
      questionWidget = questionRoot.child(0)
      answerWidgets = questionRoot.child(1).children().find(className('android.widget.TextView'))
      break;
  }
  if (!(questionWidget && answerWidgets)) {
    debugInfo('题目信息获取失败')
    return
  }
  let question = questionWidget.text()
  let answers = []
  for (let i = 0; i < answerWidgets.length; i++) {
    answers.push(answerWidgets[i].text())
  }
  debugInfo(question)
  debugInfo(JSON.stringify(answers))
}

function test5 () {
  let package = context.getPackageName()
  app.startActivity({
    packageName: package,
    action: "android.settings.APPLICATION_DETAILS_SETTINGS",
    data: "package:"+package
  });
  sleep(3000)
  let storageManage = text('清除数据').findOne(1000)
  if (!storageManage) {
    storageManage = text('存储占用').findOne(1000)
    storageManage = storageManage.parent().parent()
  }

  if (storageManage) {
    storageManage.click()
    sleep(1000)
    let cleanCache = text('清除缓存').findOne(1000)
    if (cleanCache) {
      cleanCache.click()
      sleep(1000)
    }
  }
  home()
}
test5()

