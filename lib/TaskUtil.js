let { config } = require('../config.js')(runtime, global)
let singletonRequire = require("./SingletonRequirer.js")(runtime, global);
let commonFunctions = singletonRequire("CommonFunction");
let widgetUtils = singletonRequire("WidgetUtils");
let automator = singletonRequire("Automator");
let { infoLog, logInfo, errorInfo, warnInfo, debugInfo } = singletonRequire("LogUtils");
let logFloaty = singletonRequire("LogFloaty");
let formatDate = require('./DateUtil.js')
let storageFactory = singletonRequire('StorageFactory')

let TASKSTATES_TAG = 'taskstates'
let MAXTASKRUNCOUNT = 5

function taskWorker() {
  this.callerContext = null;
  this.projectCode = null;
  this.taskStates = null;

  /**
   * 初始化任务工具，传入调用者上下文
   * @param {object} callerContext - 调用者上下文对象，需要包含isInProjectUI、isInTaskUI、startApp、openTaskWindow方法
   * @param {string} projectCode - 项目代码，用于判断是否在项目界面、任务界面、启动应用、打开任务窗口
   */
  this.initProject = function (callerContext, projectCode) {
    if (
      !callerContext ||
      !callerContext.isInProjectUI || typeof callerContext.isInProjectUI != 'function' ||
      !callerContext.isInTaskUI || typeof callerContext.isInTaskUI != 'function' ||
      !callerContext.startApp || typeof callerContext.startApp != 'function' ||
      !callerContext.openTaskWindow || typeof callerContext.openTaskWindow != 'function'
    ) {
      errorInfo("缺少必要方法，无法使用任务工具");
      return false;
    }
    this.callerContext = callerContext;
    this.projectCode = projectCode;

    TASKSTATES_TAG = 'taskstates.' + projectCode
    storageFactory.initFactoryByKey(TASKSTATES_TAG, {})
    this.taskStates = storageFactory.getValueByKey(TASKSTATES_TAG, true)
    debugInfo("任务状态：" + JSON.stringify(this.taskStates))
    this.cleanTaskStates()
  
    return true;
  };

  /*
   * 根据任务标题控件查找任务入口按钮
   * @param {object} title - 任务标题控件对象
   * @return {object} - 任务入口按钮对象
   */
  this.getTaskEntryBtnByTitle = function (title) {
    let entryBtn = null
    let findIndex = 2+title.indexInParent();
    switch(this.projectCode) {
      case 'BBFarm.alipay':
        //支付宝农场模式
        if (title.parent() && title.parent().childCount()>findIndex 
              && title.parent().child(findIndex).childCount()>0) {
          entryBtn = title.parent().child(findIndex).child(0)
        }
        break
      case 'BBFarm.taobao':
        //淘宝农场模式
        if (title.parent() && title.parent().parent() && title.parent().parent().childCount()>0) {
          entryBtn = title.parent().parent().child(1)
        }
        break
      default:
        if (title.parent() && title.parent().childCount()>findIndex) {
          entryBtn = title.parent().child(findIndex)
        }
        break
    }
    return entryBtn
  }
  
  /*
   * 根据任务入口按钮查找任务标题控件
   * @param {object} entryBtn - 任务入口按钮对象
   * @param {int} mode - 匹配模式，0: 默认，1：支付宝农场模式，2：淘宝农场模式
   * @return {object} - 任务标题控件对象
   */
  this.getTaskTitleObj = function (entryBtn) {
    let title = null
    let findIndex = null
    switch(this.projectCode) {
      case 'BBFarm.alipay':
        //支付宝农场模式
        let entryBtnParent = entryBtn.parent()
        if (entryBtnParent) {
          let taskTop = entryBtnParent.parent()
          for (let i=0;i<taskTop.childCount();i++) {
            let sourceID1 = JSON.parse(JSON.stringify(taskTop.child(i))).mInfo.mSourceNodeId
            let sourceID2 = JSON.parse(JSON.stringify(entryBtnParent)).mInfo.mSourceNodeId
            if (sourceID1 == sourceID2) {
              findIndex = i-2
              break
            }
          }
          if (taskTop&&findIndex>=0) {
            title = taskTop.child(findIndex)
          }
        }
        break
      case 'BBFarm.taobao':
        //淘宝农场模式
        if (entryBtn.parent() && entryBtn.indexInParent()==1 && entryBtn.parent().child(0).childCount()>0) {
          title = entryBtn.parent().child(0).child(0)
        }
        break
      case 'ant_forest':
        // 蚂蚁森林模式
        try {
          if (entryBtn.parent() && entryBtn.parent().parent()) {
            title = entryBtn.parent().parent().child(1)
          }
        } catch(e) {
          errorInfo('获取任务标题失败：' + e)
        }
        break
      case 'village':
        // 蚂蚁新村模式
        findIndex = entryBtn.indexInParent()-2
        if (entryBtn.parent() && findIndex>=0) {
          title = entryBtn.parent().child(findIndex)
        }
        if (title && title.text() && title.text().indexOf('/时')>=0) {
          findIndex = entryBtn.indexInParent()-4
          if (entryBtn.parent() && findIndex>=0) {
            title = entryBtn.parent().child(findIndex)
          }
        }
        break
      default:
        findIndex = entryBtn.indexInParent()-2
        if (entryBtn.parent() && findIndex>=0) {
          title = entryBtn.parent().child(findIndex)
        }
        break
    }
    return title
  }

  /**
   * 清理无效的任务状态
   */
  this.cleanTaskStates = function () {
    let today = formatDate(new Date(), 'yyyy-MM-dd');
    
    // 创建一个新的对象来存储符合条件的任务状态
    let updatedTaskStates = {};
  
    // 遍历 this.taskStates 的每个键值对
    for (let key in this.taskStates) {
      if (this.taskStates.hasOwnProperty(key)) {
        let value = this.taskStates[key];
        if (value.date === today || value.runCount >= MAXTASKRUNCOUNT) {
          updatedTaskStates[key] = value;
        }
      }
    }
  
    // 更新 this.taskStates
    this.taskStates = updatedTaskStates;
  
    // 记录日志
    debugInfo("任务状态(清理后)：" + JSON.stringify(this.taskStates));
  
    // 更新存储
    storageFactory.updateValueByKey(TASKSTATES_TAG, this.taskStates);
  }

  /**
   * 记录任务运行次数
   * @param {string} taskTitle - 任务标题
   */
  this.setTaskRunTimes = function (taskTitle) {
    let today = formatDate(new Date(), 'yyyy-MM-dd')
    if (!this.taskStates[taskTitle]) {
      this.taskStates[taskTitle] = {
        failDayCount: 0,
        runCount: 1,
        date: today
      }
    } else {
      if (this.taskStates[taskTitle].date !== today) {
        this.taskStates[taskTitle].date = today
        this.taskStates[taskTitle].runCount = 0
      }
      this.taskStates[taskTitle].runCount++
      if (this.taskStates[taskTitle].runCount>=MAXTASKRUNCOUNT) {
        this.taskStates[taskTitle].failDayCount++
      }
    }

    debugInfo(["{} 保存任务状态：{}", taskTitle, JSON.stringify(this.taskStates[taskTitle])])

    storageFactory.updateValueByKey(TASKSTATES_TAG, this.taskStates)
  }
  
  /**
   * 检查任务是否可以运行
   * @param {string} taskTitle - 任务标题
   * @return {boolean} - 是否可以运行
   */
  this.checkTaskCanRun = function (taskTitle) {
    debugInfo(['{} 检查任务状态：{}', taskTitle, JSON.stringify(this.taskStates[taskTitle])])

    let result = true
    if (this.taskStates[taskTitle]) {
      if (this.taskStates[taskTitle].failDayCount>=3) {
        result = false
      } else {
        let today = formatDate(new Date(), 'yyyy-MM-dd')
        if (this.taskStates[taskTitle].date === today) {
          let runCount = this.taskStates[taskTitle].runCount || 0
          if (runCount>=MAXTASKRUNCOUNT) {
            result = false
          }
        }
      }
    }
    return result
  }

  /**
   * 返回任务界面
   * @return {boolean} - 是否返回成功
   */
  this.backToTaskUI = function () {
    if (!this.callerContext) {
      return false;
    }

    warnInfo("检查是否在任务界面，不在的话返回，尝试两次");
    let backResult = false;
    let waitCount = 2;
    while (!(backResult = this.callerContext.isInTaskUI(this.projectCode, 5000)) && waitCount-- > 0) {
      automator.back();
      sleep(1000);
    }

    if (backResult) {
      debugInfo('已返回任务界面')
      sleep(2000);
      return true;
    }

    warnInfo(["返回失败，重新尝试打开任务界面"]);
    if (!this.callerContext.isInProjectUI(this.projectCode)) {
      warnInfo(["不在项目界面，重新尝试打开项目"]);
      commonFunctions.minimize()
      sleep(1000)
      this.callerContext.startApp(this.projectCode);
    }

    if (!this.callerContext.isInProjectUI(this.projectCode)) {
      warnInfo(["打开项目失败，5分钟后重新尝试"]);
      commonFunctions.setUpAutoStart(5);
    }

    if (!this.callerContext.isInTaskUI(this.projectCode)) {
      if (!this.callerContext.openTaskWindow(this.projectCode)) {
        warnInfo(["打开任务界面失败，5分钟后重新尝试"]);
        commonFunctions.setUpAutoStart(5);
      }
    }
    return false;
  };

  /**
   * 执行通用任务
   * @param {string} titleText - 任务标题文本
   * @param {object} entryBtn - 任务入口按钮对象
   * @param {number} timeout - 超时时间，单位秒，默认15秒
   * @param {boolean} needScroll - 是否需要滑动，默认不需要
   * @return {boolean} - 是否执行成功
   */
  this.doCommonTask = function (titleText, entryBtn, timeout, needScroll) {
    if (!entryBtn) {
      logFloaty.pushLog("无入口按钮，跳过执行：" + titleText);
      return false;
    }
    titleText = titleText || entryBtn.text();
    timeout = timeout || 15;
    let taskType = "browse";

    currentRunning = commonFunctions.myCurrentPackage();
    debugInfo("当前包名：" + currentRunning);

    entryBtn.click();
    logFloaty.pushLog("等待进入 " + titleText + ", 计时：" + timeout + ", 滑动：" + needScroll);
    commonFunctions.waitForAction(10, titleText, function () {
      let popupConfirmBtn = widgetUtils.widgetGetOne("^允许|确认$", 1000, false, false, (m) =>
        m.boundsInside(0, config.device_height * 0.2, config.device_width, config.device_height)
      );
      if (popupConfirmBtn) {
        debugInfo("找到了弹窗确认按钮");
        automator.clickRandom(popupConfirmBtn);
        sleep(5000)
        return true
      }
      return false
    });

    if (currentRunning != commonFunctions.myCurrentPackage()) {
      taskType = "visitapp";
      //已进入目标应用，等待加载完成
      commonFunctions.waitForAction(5,taskType);
    } else if (this.callerContext && this.callerContext.isInTaskUI && this.callerContext.isInTaskUI()) {
      logFloaty.pushLog("进入任务失败：" + titleText);
      return false;
    }

    //检查是否有验证窗口，有则等待直到消失
    commonFunctions.waitForTBVerify();

    //根据需要等待一段时间进行浏览
    if (timeout) {
      logFloaty.pushLog(titleText + " 等待倒计时 " + timeout + "s");
      let limit = timeout;
      while (limit-- > 0) {
        //检查是否有弹窗
        let popupCancelBtn = widgetUtils.widgetGetOne("^取消|忽略|关闭|以后再说$", 1000, false, false, (m) =>
          m.boundsInside(0, config.device_height * 0.2, config.device_width, config.device_height)
        );
        if (popupCancelBtn) {
          debugInfo("找到了弹窗取消按钮");
          automator.clickRandom(popupCancelBtn);
        }

        logFloaty.replaceLastLog(titleText + " 等待倒计时结束 剩余：" + limit + "s");
        if (limit % 2 == 0 && needScroll) {
          automator.scrollUpAndDown();
          sleep(100);
        } else {
          sleep(1000);
        }
      }
    } else {
      sleep(3000);
      logFloaty.pushLog("啥也不用干 直接返回");
    }
    if (taskType == "visitapp") {
      commonFunctions.minimize();
      sleep(1000);
      if (currentRunning != commonFunctions.myCurrentPackage()) {
        logFloaty.pushLog("未返回原应用，直接打开 " + currentRunning);
        app.launch(currentRunning);
        sleep(3000);
      }
    }

    automator.back();
    sleep(1000);
    return true;
  };

  /**
   * 执行一个任务
   * @param {object} taskInfo - 任务信息对象
   * @param {object} titleObj - 任务标题对象
   * @param {object} entryBtn - 任务入口按钮对象
   * @return {boolean} - 是否执行成功
   */
  this.doOneTask = function (taskInfo, titleObj, entryBtn) {
    if (!this.callerContext || !taskInfo || !titleObj || !entryBtn) {
      return false;
    }

    let action = taskInfo.taskType || "common";

    if (action=="common" || action=='browse' || action=='app') {
      return this.doCommonTask(titleObj.text(), entryBtn, taskInfo.timeout, taskInfo.needScroll);
    } else if (this.callerContext[action]) {
      return this.callerContext[action](titleObj, entryBtn);
    } else {
      return false;
    }
  };

  /**
   * 执行多个任务
   * @param {array} taskInfos - 任务信息数组
   * @return {boolean} - 是否执行了任务
   */
  this.doTasks = function (taskInfos) {
    if (!this.callerContext || !taskInfos) {
      return false;
    }

    let hasTask = false
    let hasExecuted = false
    do {
      hasTask = false
      for (let i = 0; i < taskInfos.length; i++) {
        let taskInfo = taskInfos[i]
        let entryBtns = widgetUtils.widgetGetAll(taskInfo.btnRegex, 3000)
        if (entryBtns && entryBtns.length > 0) {
          for (let entryBtn of entryBtns) {
            let titleObj = this.getTaskTitleObj(entryBtn)
            if (titleObj) {
              let titleText = titleObj.text()
              logFloaty.pushLog('发现任务：'+titleText)
              let task = null
              for (let j = 0; j < taskInfo.tasks.length; j++) {
                if (titleText.match(taskInfo.tasks[j].titleRegex)) {
                  task = taskInfo.tasks[j]
                  break
                }
              }
              if (!task) {
                logFloaty.pushLog('未定义任务：'+titleText)
                if (this.checkTaskCanRun(titleText)) {
                  task = {timeout:15,needScroll:true}
                } else {
                  task = {taskType:'disable'}
                }
              }
              if (task.taskType=='disable') {
                logFloaty.pushLog('任务已禁用：'+titleText)
              } else {
                logFloaty.pushLog('开始执行任务：'+titleText)
                if (!task.taskType) {
                  this.setTaskRunTimes(titleText)
                }
                let taskResult = this.doOneTask(task, titleObj, entryBtn)
                hasTask = taskResult || hasTask
                hasExecuted = taskResult || hasExecuted
                if (!this.backToTaskUI()) {
                  logFloaty.pushLog('返回任务界面失败，跳过当前按钮类型剩余任务，重新识别')
                  break
                }
                sleep(3000)
              }
            }
          }
        }
      }
    } while (hasTask)

    return hasExecuted
  };
}

module.exports = new taskWorker();
