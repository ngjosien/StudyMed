// Which kind of device the app is running on. The phone app has no tray, no
// "start with Windows" and no self-updates; its layout is built for touch.
export const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
