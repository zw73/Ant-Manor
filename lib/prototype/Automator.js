/*
 * @Author: TonyJiangWJ
 * @Date: 2020-04-25 20:37:31
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2024-07-08 14:47:35
 * @Description: 
 */
let { config: _config } = require('../../config.js')(runtime, global)
let singletonRequire = require('../SingletonRequirer.js')(runtime, global)
let _logUtils = singletonRequire('LogUtils')
let FileUtils = singletonRequire('FileUtils')
let customLockScreen = files.exists(FileUtils.getCurrentWorkPath() + '/extends/LockScreen.js') ? require('../../extends/LockScreen.js') : null


const hasRootPermission = function () {
  return files.exists("/sbin/su") || files.exists("/system/xbin/su") || files.exists("/system/bin/su")
}

const _automator = (device.sdkInt < 24 || hasRootPermission()) ? new Automation_root() : new Automation()

/**
 * 获取区域内的随机数，并避免获取到边界
 * @param {*} min 最小值
 * @param {*} max 最大值
 * @returns 随机值
 */
const randomRange = (min, max) => {
  let padding = Math.floor((max - min) / 5)
  return min + padding + Math.ceil(Math.random() * (max - min - 2 * padding))
}

function isPositionValid (x, y) {
  if (x < 0 || y < 0 || x >= _config.device_width || y >= _config.device_height) {
    return false
  }
  return true
}

function checkClickPosition (x, y) {
  if (!isPositionValid(x, y)) {
    throw new Error('点击区域超出屏幕外，请检查代码是否正确：' + x + ',' + y)
  }
}

module.exports = {
  checkClickable: function (x, y) {
    return isPositionValid(x, y)
  },
  checkCenterClickable: function (target) {
    return target && target.bounds && isPositionValid(target.bounds().centerX(), target.bounds().centerY())
  },
  registerVisualHelper: function (visualHelper) {
    _automator.registerVisualHelper(visualHelper)
  },
  click: function (x, y) {
    checkClickPosition(x, y)
    _logUtils.debugInfo(['点击了：{}, {}', x, y])
    return _automator.click(x, y)
  },
  clickPointRandom: function (x, y) {
    x = randomRange(x-5, x+5)
    y = randomRange(y-5, y+5)
    _logUtils.debugInfo(['random Point clicked: [{}, {}]', x, y])
    return _automator.click(x, y)
  },
  clickCenter: function (obj) {
    checkClickPosition(obj.bounds().centerX(), obj.bounds().centerY())
    return _automator.click(obj.bounds().centerX(), obj.bounds().centerY())
  },
  clickRandom: function (obj) {
    let bounds = obj.bounds()
    let { left, top, right, bottom } = bounds
    let x = randomRange(left, right)
    let y = randomRange(top, bottom)
    _logUtils.debugInfo(['random clicked: [{}, {}]', x, y])
    if (_automator.visualHelper) {
      _automator.visualHelper.addText('↓', { x: x - 8, y: y - 2 }, '#e440e1')
      _automator.visualHelper.addRectangle('', [x, y, 5, 5])
    }
    return _automator.click(x, y)
  },
  clickRandomRegion: function (region) {
    if (Object.prototype.toString.call(region) === '[object Array]' && region.length > 3) {
      region = { left: region[0], top: region[1], width: region[2], height: region[3] }
    }
    let { left, top, width, height } = region
    let right = left + width, bottom = top + height
    if (left < 0 || left > _config.device_width
      || top < 0 || top > _config.device_height
      || right < 0 || right > _config.device_width
      || bottom < 0 || bottom > _config.device_height) {
      _logUtils.errorInfo(['区域信息不在屏幕内，取消点击：{}', region])
      return false
    }
    let x = randomRange(left, left + width)
    let y = randomRange(top, top + height)
    _logUtils.debugInfo(['randomRegion clicked: [{}, {}]', x, y])
    if (_automator.visualHelper) {
      _automator.visualHelper.addText('↓', { x: x - 8, y: y - 2 }, '#e440e1')
      _automator.visualHelper.addRectangle('', [x, y, 5, 5])
    }
    return _automator.click(x, y)
  },
  swipe: function (x1, y1, x2, y2, duration) {
    return _automator.swipe(x1, y1, x2, y2, duration)
  },
  gesture: function (duration, points) {
    return _automator.gesture(duration, points)
  },
  gesturePath: function (start, end, duration) {
    return _automator.gesturePath(start, end, duration)
  },
  back: function () {
    return _automator.back()
  },
  lockScreen: function () {
    _config.notNeedRelock = true
    return _automator.lockScreen()
  },
  scrollDown: function () {
    if (_config.useCustomScrollDown) {
      return _automator.scrollDown()
    } else {
      return scrollDown()
    }
  },
  /**
   * 页面向下滑动 startY > endY 手势向上
   * 
   * @param {*} startY 起始高度
   * @param {*} endY 结束高度
   * @param {*} duration 
   * @returns 
   */
  gestureDown: function (startY, endY, duration) {
    return _automator.scrollDown(startY, endY, duration || 800)
  },
  /**
   * 页面向上滑动 startY < endY 手势向下
   * 
   * @param {*} startY 起始高度
   * @param {*} endY 结束高度
   * @param {*} duration 
   * @returns 
   */
  gestureUp: function (startY, endY, duration) {
    return _automator.scrollUp(startY, endY, duration)
  },
  scrollUp: function (speed) {
    if (_config.useCustomScrollDown) {
      _automator.scrollUp()
    } else {
      scrollUp()
    }
  },
  scrollUpAndDown: function (speed) {
    _automator.scrollUpAndDown(speed)
  },
  clickBack: function (forceBack) {
    return _automator.clickBack(forceBack)
  },
  clickClose: function () {
    return _automator.clickClose()
  },
  randomScrollDown: function (minStart, maxStart, minEnd, maxEnd, isFast) {
    let height = _config.device_height
    let startY = randomNum(minStart || height * 0.80, maxStart || height * 0.85)
    let endY = randomNum(minEnd || height * 0.3, maxEnd || height * 0.35)
    let duration = 100 +  Math.random() * 1000 % 300 + Math.abs(startY-endY) / (isFast?4:2)
    _logUtils.debugInfo(['ScrollDown 滑动起始：{} 结束：{}', startY, endY])
    this.gestureDown(startY, endY, duration)
    sleep(duration)
  },
  randomScrollUp: function (minStart, maxStart, minEnd, maxEnd, isFast) {
    let height = _config.device_height
    let startY = randomNum(minStart || height * 0.3, maxStart || height * 0.35)
    let endY = randomNum(minEnd || height * 0.8, maxEnd || height * 0.85)
    let duration = 100 +  Math.random() * 1000 % 300 + Math.abs(startY-endY) / (isFast?4:2)
    _logUtils.debugInfo(['ScrollUp 滑动起始：{} 结束：{}', startY, endY])
    this.gestureUp(startY, endY, duration)
    sleep(duration)
  },
  clearCache: function () {
    auto.clearCache && auto.clearCache()
  }
}

function CommonAutomation () {
  this.visualHelper = null

  this.registerVisualHelper = function (visualHelper) {
    this.visualHelper = visualHelper
  }

  this.scrollDown = function (startY, endY, duration) {
    let deviceHeight = _config.device_height || 1900
    let bottomHeight = _config.bottomHeight || 250
    let points = []
    let startX = parseInt(_config.device_width / 2) + ~~(Math.random() * 100 % 40 + 50) * (Math.random() > 0.5 ? 1 : -1)
    startY = startY || deviceHeight - bottomHeight
    endY = endY || parseInt(deviceHeight / 3)
    if (startY < endY) {
      let tmp = endY
      endY = startY
      startY = tmp
    }
    if (startY> deviceHeight-200) {
      startY = deviceHeight - 200
    }
    let distY = startY - endY
    let distX = 100

    let sum = 0, step = 1
    let gaps = []
    while (sum < distY) {
      step *= 1.2
      sum += Math.log2(step)
      gaps.push(Math.log2(step))
    }
    let currentY = startY, currentX = startX
    let gapX = distX / gaps.length
    gaps.reverse().forEach(v => {
      points.push([currentX, currentY])
      currentY -= v
      currentX += gapX
    })
    this.gesture(duration || points.length * 8, points)
  }

  this.scrollUp = function (startY, endY, duration) {
    let deviceHeight = _config.device_height || 1900
    let points = []
    let startX = parseInt(_config.device_width / 2) + ~~(Math.random() * 100 % 40 + 50) * (Math.random() > 0.5 ? 1 : -1)
    startY = startY || deviceHeight / 3
    endY = endY || deviceHeight * 0.75
    if (startY > endY) {
      let tmp = endY
      endY = startY
      startY = tmp
    }
    let distY = endY - startY
    let distX = 100
    let sum = 0, step = 1
    let gaps = []
    while (sum < distY) {
      step *= 1.2
      sum += Math.log2(step)
      gaps.push(Math.log2(step))
    }
    let currentY = startY, currentX = startX
    let gapX = distX / gaps.length
    gaps.reverse().forEach(v => {
      points.push([currentX, currentY])
      currentY += v
      currentX += gapX
    })
    this.gesture(duration || points.length * 8, points)
  }

  this.scrollUpAndDown = function (speed) {
    let millis = parseInt(speed || _config.scrollDownSpeed || 500)

    let deviceHeight = _config.device_height || 1900
    let bottomHeight = _config.bottomHeight || 250
    let x = parseInt(_config.device_width / 2)
    let startPoint = deviceHeight - bottomHeight
    // 滑动距离，二分之一屏幕
    let distance = parseInt(deviceHeight / 2)
    let endPoint = startPoint - distance
    // 手势上划
    this.swipe(x, startPoint, x + 100, endPoint, millis)
    sleep(millis + 20)
    this.swipe(x, endPoint, x + 100, startPoint, millis)
  }

  this.clickBack = function (forceBack) {
    let hasButton = false
    if (descEndsWith('返回').exists()) {
      descEndsWith('返回')
        .findOne(_config.timeout_findOne)
        .click()
      hasButton = true
    } else if (textEndsWith('返回').exists()) {
      textEndsWith('返回')
        .findOne(_config.timeout_findOne)
        .click()
      hasButton = true
    } else if (forceBack) {
      this.back()
    }
    if (hasButton) {
      sleep(200)
    }
    return hasButton
  }

  this.clickClose = function () {
    let hasButton = false
    if (descEndsWith('关闭').exists()) {
      descEndsWith('关闭')
        .findOne(_config.timeout_findOne)
        .click()
      hasButton = true
    } else if (textEndsWith('关闭').exists()) {
      textEndsWith('关闭')
        .findOne(_config.timeout_findOne)
        .click()
      hasButton = true
    }
    if (hasButton) {
      sleep(200)
    }
    return hasButton
  }

  this.gesturePath = function (start, end, duration) {

  }

}
function Automation_root () {
  CommonAutomation.call(this)

  this.check_root = function () {
    if (!(files.exists("/sbin/su") || files.exists("/system/xbin/su") || files.exists("/system/bin/su"))) throw new Error("未获取ROOT权限")
  }

  this.click = function (x, y) {
    this.check_root()
    return (shell("input tap " + x + " " + y, true).code === 0)
  }

  this.swipe = function (x1, y1, x2, y2, duration) {
    this.check_root()
    return (shell("input swipe " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + duration, true).code === 0)
  }

  this.gesture = function (duration, points) {
    this.check_root()
    let len = points.length,
      step = duration / len,
      start = points.shift()

    // 使用 RootAutomator 模拟手势，仅适用于安卓5.0及以上
    let ra = new RootAutomator()
    ra.touchDown(start[0], start[1])
    sleep(step)
    points.forEach(function (el) {
      ra.touchMove(el[0], el[1])
      sleep(step)
    })
    ra.touchUp()
    ra.exit()
    return true
  }

  this.back = function () {
    this.check_root()
    return (shell("input keyevent KEYCODE_BACK", true).code === 0)
  }

  this.lockScreen = function () {
    return (shell("input keyevent 26", true).code === 0)
  }

  this.gesturePath = function (start, end, duration) {
    this.check_root()
    duration = duration || 1000
    let points = generateRandomCubicBezierPath(start.x, start.y, end.x, end.y, 10)
    let len = points.length,
      step = duration / len,
      start = points.shift()

    // 使用 RootAutomator 模拟手势，仅适用于安卓5.0及以上
    let ra = new RootAutomator()
    ra.touchDown(start[0], start[1])
    sleep(step)
    points.forEach(function (el) {
      ra.touchMove(el[0], el[1])
      sleep(step)
    })
    ra.touchUp()
    ra.exit()
    return true
  }
}

function Automation () {
  CommonAutomation.call(this)

  this.click = function (x, y) {
    return click(x, y)
  }

  this.swipe = function (x1, y1, x2, y2, duration) {
    return swipe(x1, y1, x2, y2, duration)
  }

  this.gesture = function (duration, points) {
    return gesture(duration, points)
  }

  this.back = function () {
    return back()
  }

  /**
   * 首先尝试无障碍方式锁屏，失败后使用 下拉状态栏，点击锁屏按钮 的方式锁屏
   */
  this.lockScreen = function () {
    // 使用无障碍服务进行锁屏
    if (auto.service.performGlobalAction(8)) {
      return
    }
    _logUtils.debugInfo('使用无障碍锁屏失败，尝试模拟点击方式')
    if (customLockScreen) {
      customLockScreen()
    } else {
      // MIUI 12 新控制中心
      swipe(800, 10, 800, 500, 230)
      sleep(1000)
      // 点击锁屏按钮
      click(parseInt(_config.lock_x), parseInt(_config.lock_y))
    }
  }

  /**
   * 模拟手势滑动 通过贝塞尔曲线加入随机波动
   * @param {Point} start {x:,y:}
   * @param {Point} end {x:,y:}
   * @param {Number} duration 
   */
  this.gesturePath = function (start, end, duration) {
    // 边界检查
    if (!start || !end || !isPositionValid(start.x, start.y) || !isPositionValid(end.x, end.y)) {
      _logUtils.errorInfo(['无效的起点或终点坐标', start, end]);
      return false;
    }

    duration = duration || 1000;
    
    // 使用贝塞尔曲线生成更自然的滑动路径
    let points = generateRandomCubicBezierPath(start.x, start.y, end.x, end.y, 50);
    
    // 添加随机速度变化
    let stepDuration = duration / points.length;
    let speedVariation = stepDuration * 0.3; // 30%的速度变化
    
    // 生成带速度变化的路径
    let finalPoints = points.map((point, index) => {
      let speed = stepDuration + (Math.random() * speedVariation * (Math.random() > 0.5 ? 1 : -1));
      return {
        point,
        duration: Math.max(10, Math.round(speed)) // 确保最小持续时间
      };
    });
    
    // 执行手势
    let totalDuration = 0;
    let gesturePoints = [];
    finalPoints.forEach(({point, duration}) => {
      gesturePoints.push(point);
      totalDuration += duration;
    });
    
    _logUtils.debugInfo(['总时间：{}, 路径：{}', totalDuration, JSON.stringify(gesturePoints)]);
    return this.gesture(totalDuration, gesturePoints);
  }
}

function randomNum (min, max) {
  return ~~(min + Math.random() * (max - min))
}

function getRandomControlPoints (sx, sy, ex, ey) {
  let distance = Math.hypot(ex - sx, ey - sy)
  // 控制点偏移范围随距离变化
  let offset = Math.min(distance * 0.3, 200)
  
  // 计算中点
  let midX = (sx + ex) / 2
  let midY = (sy + ey) / 2
  
  // 生成随机偏移
  let offsetX1 = (Math.random() - 0.5) * offset
  let offsetY1 = (Math.random() - 0.5) * offset
  let offsetX2 = (Math.random() - 0.5) * offset
  let offsetY2 = (Math.random() - 0.5) * offset

  return {
    controlX1: midX + offsetX1,
    controlY1: midY + offsetY1,
    controlX2: midX + offsetX2,
    controlY2: midY + offsetY2
  }
}

function bezierCreate(x1, y1, x2, y2, x3, y3, x4, y4) {
  let points = [];
  let steps = 50; // 采样点数量
  
  // 确保控制点与起点/终点不同
  if ((x2 === x1 && y2 === y1) || (x3 === x4 && y3 === y4)) {
    // 如果控制点与起点/终点重合，生成直线路径
    return [
      [x1, y1],
      [x4, y4]
    ];
  }

  let lastX = null, lastY = null;
  
  for (let i = 0; i <= steps; i++) {
    let t = i / steps;
    let u = 1 - t;
    
    // 三次贝塞尔曲线公式
    let x = u*u*u*x1 + 3*u*u*t*x2 + 3*u*t*t*x3 + t*t*t*x4;
    let y = u*u*u*y1 + 3*u*u*t*y2 + 3*u*t*t*y3 + t*t*t*y4;
    
    // 四舍五入到整数
    let roundedX = Math.round(x);
    let roundedY = Math.round(y);
    
    // 跳过与上一个点相同的点
    if (lastX === null || lastY === null || 
        roundedX !== lastX || roundedY !== lastY) {
      points.push([roundedX, roundedY]);
      lastX = roundedX;
      lastY = roundedY;
    }
  }
  
  // 确保至少有两个不同的点
  if (points.length < 2) {
    return [
      [x1, y1],
      [x4, y4]
    ];
  }
  
  return points;
}

function generateRandomCubicBezierPath(x1, y1, x2, y2, numPoints) {
  let distance = Math.hypot(x2 - x1, y2 - y1)
  
  // 根据距离动态调整控制点偏移量
  let offset = Math.min(distance * 0.5, 300);
  
  // 生成随机控制点
  let { controlX1, controlY1, controlX2, controlY2 } = getRandomControlPoints(x1, y1, x2, y2);
  
  // 生成贝塞尔曲线点
  let points = bezierCreate(x1, y1, controlX1, controlY1, controlX2, controlY2, x2, y2);
  
  // 根据距离动态调整点的数量
  let pointCount = Math.max(10, Math.min(50, Math.floor(distance / 10)));
  
  // 均匀采样
  let step = Math.floor(points.length / pointCount);
  let result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  
  // 确保包含起点和终点
  if (!result.some(p => p[0] === x1 && p[1] === y1)) {
    result.unshift([x1, y1]);
  }
  if (!result.some(p => p[0] === x2 && p[1] === y2)) {
    result.push([x2, y2]);
  }
  
  return result;
}


/**
 * [delay1, duration1, [x1, y1], [x2, y2], …], [delay2, duration2, [x3, y3], [x4, y4], …], …
 * @returns 
 */
function myGestures () {
  return runtime.automator.gestures(toStrokes(arguments));
}
function toStrokes (args) {
  let screenMetrics = runtime.getScreenMetrics();
  let len = args.length;
  let strokes = java.lang.reflect.Array.newInstance(android.accessibilityservice.GestureDescription.StrokeDescription, len);
  for (let i = 0; i < len; i++) {

    let gesture = args[i];
    let pointsIndex = 1;
    let start = 0
    let delay = 0
    if (typeof (gesture[1]) == 'number') {
      start = gesture[0];
      delay = gesture[1];
      pointsIndex = 2;
    } else {
      start = 0;
      delay = gesture[0];
    }

    let gestureLen = gesture.length;
    let path = new android.graphics.Path();
    path.moveTo(screenMetrics.scaleX(gesture[pointsIndex][0]), screenMetrics.scaleY(gesture[pointsIndex][1]));
    for (let j = pointsIndex + 1; j < gestureLen; j++) {
      path.lineTo(screenMetrics.scaleX(gesture[j][0]), screenMetrics.scaleY(gesture[j][1]));
    }
    strokes[i] = new android.accessibilityservice.GestureDescription.StrokeDescription(path, start, delay, true);
  }
  return strokes;
}
