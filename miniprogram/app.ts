// app.ts
import { pauseVisitorTimer, resumeVisitorTimer } from './utils/visitor'
App<IAppOption>({
  globalData: {},
  onLaunch() {},
  onShow() { resumeVisitorTimer() },
  onHide() { pauseVisitorTimer() },
})
