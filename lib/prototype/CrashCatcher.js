/*
 * @Author: TonyJiangWJ
 * @Date: 2020-05-27 23:08:29
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2024-11-28 15:42:02
 * @Description: AutoJS崩溃自启
 */

let { storage_name, config } = require('../../config.js')(runtime, global)
let singletonRequire = require('../SingletonRequirer.js')(runtime, global)
let lockableStorages = singletonRequire('LockableStorage')
let logUtils = singletonRequire('LogUtils')
let fileUtils = singletonRequire('FileUtils')
let timers = singletonRequire('Timers')

const RUN_STATE_STORAGE = lockableStorages.create(storage_name + '_crash_catch')

function CrashCatcher () {
  this.currentSource = engines.myEngine().getSource() + ''
  this.setOnRunning = function () {
    logUtils.debugInfo('设置脚本状态为执行中')
    RUN_STATE_STORAGE.put('running', true)
    RUN_STATE_STORAGE.put('running_source', this.currentSource)
  }
  this.setDone = function () {
    logUtils.debugInfo('设置脚本状态为执行完毕')
    RUN_STATE_STORAGE.put('running', false)
  }
  this.restartIfCrash = function () {
    cleanAutojsAPPCache()
    if (!config.auto_restart_when_crashed) {
      return
    }
    let runningStatus = RUN_STATE_STORAGE.get('running')
    if (runningStatus === 'true' || runningStatus === true) {
      let source = RUN_STATE_STORAGE.get('running_source') || fileUtils.getRealMainScriptPath()
      logUtils.warnInfo('AutoJs可能异常崩溃且已重启，重新执行脚本:' + source)
      engines.execScriptFile(source, {
        path: source.substring(0, source.lastIndexOf('/')),
        arguments: {
          executeByDispatcher: true,
        }
      })
    } else {
      logUtils.debugInfo('AutoJs可能异常崩溃且已重启，但脚本已正常走完流程，不重新执行')
    }
  }
}

let crashCatcher = new CrashCatcher()

if (typeof module === 'undefined') {
  // running mode
  crashCatcher.restartIfCrash()
} else {
  if (config.auto_restart_when_crashed) {
    function getOnStartAction () {
      let is_modify = Object.prototype.toString.call(org.autojs.autojsm.timing.TimedTask).match(/Java(Class|Object)/)
      if (is_modify) {
        return "org.autojs.autojsm.action.startup"
      } else {
        return "org.autojs.autojs.action.startup"
      }
    }
    let intentTask = {
      isLocal: true,
      path: fileUtils.getCurrentWorkPath() + '/lib/prototype/CrashCatcher.js',
      action: getOnStartAction()
    }
    let existTask = timers.queryIntentTasks(intentTask)
    if (!existTask || existTask.length === 0) {
      logUtils.debugInfo('创建异常终止后的重启任务')
      timers.addIntentTask(intentTask)
    } else {
      logUtils.debugInfo(['异常终止的重启任务已存在: {}', JSON.stringify(existTask)])
    }
  }
  module.exports = crashCatcher
}

function cleanAutojsAPPCache() {
  logUtils.debugInfo('尝试清理AutoJs的缓存')
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
    if (storageManage) {
      storageManage = storageManage.parent().parent()
    }
  }

  if (storageManage) {
    storageManage.click()
    sleep(1000)
    let cleanCache = text('清除缓存').findOne(1000)
    if (cleanCache) {
      cleanCache.click()
      sleep(1000)
      let confirmBtn = text('确定').findOne(1000)
      if (confirmBtn) {
        confirmBtn.click()
        sleep(1000)
      }
      logUtils.debugInfo('完成清理AutoJs的缓存')
    }
  }
  back()
  sleep(500)
  home()
}