import { beginTutorial, finishTutorial, pauseVisitorTimer } from '../../utils/visitor'

Page({
  onLoad() { beginTutorial() },
  onShow() { pauseVisitorTimer() },
  onUnload() { finishTutorial() },
  closeTutorial() {
    finishTutorial()
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/dashboard/dashboard' })
  },
})
