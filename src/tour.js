// Interactive tours (coach marks) via driver.js.
//  - main tour: the app shell (runs once on first launch, re-runnable from
//    Settings → "Show tour").
//  - dialog tour: the New-simulator dialog (runs once the first time it opens,
//    re-runnable from the "?" in the dialog header).
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const MAIN_FLAG = 'trackbox-tour-done'
const DIALOG_FLAG = 'trackbox-tour-dialog-done'

// One tour at a time — don't let the dialog tour fire over the main one.
let active = false

function start(steps, flag) {
  if (active) return
  const available = steps.filter((s) => !s.element || document.querySelector(s.element))
  if (!available.length) return
  active = true
  // Mark "seen" only once it actually starts, so a suppressed auto-run (e.g.
  // another tour active) can still show next time.
  if (flag) {
    try {
      localStorage.setItem(flag, '1')
    } catch {
      // ignore
    }
  }
  driver({
    showProgress: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    onDestroyed: () => {
      active = false
    },
    steps: available,
  }).drive()
}

function mainSteps() {
  return [
    {
      popover: {
        title: `Welcome to ${__APP_PRODUCT__}`,
        description:
          'Simulate GPS trackers that feed data into flespi — drive virtual devices along routes and watch them stream messages. Here are the basics.',
      },
    },
    {
      element: '#tour-menu',
      popover: {
        title: 'Your fleet & login',
        description:
          'Open the side panel to log in with a flespi token, see running simulators, and reach Settings.',
      },
    },
    {
      element: '#tour-add',
      popover: {
        title: 'Add a simulator',
        description:
          'Create a device: upload a route (GPX / KML / GeoJSON / flespi-JSON) or build one by roads, then choose how it sends — Device REST, HTTP channel or MQTT.',
      },
    },
    {
      element: '#tour-startall',
      popover: {
        title: 'Run it',
        description:
          'Start all simulators — they move on the map and send messages on a steady cadence. Each card has its own start/pause/stop and live controls.',
      },
    },
    {
      element: '#tour-theme',
      popover: { title: 'Theme', description: 'Switch between light and dark.' },
    },
    {
      // Desktop only — auto-skipped on the web build (the element won't exist).
      element: '#tour-quit',
      popover: {
        title: 'Quit vs. close',
        description:
          'Closing the window (✕) hides the app to the system tray — your simulators keep running in the background. Use this Quit button to exit the app completely.',
      },
    },
  ]
}

function dialogSteps() {
  return [
    {
      popover: {
        title: 'Set up a simulator',
        description:
          "A simulator drives a virtual device along a route and streams its position to flespi. Here's what to fill in.",
      },
    },
    {
      element: '#tour-route-mode',
      popover: {
        title: 'Route',
        description:
          'Upload a route file (GPX / KML / GeoJSON / flespi-JSON) or build one by roads — click the map to drop waypoints. A loaded route is previewed on the map.',
      },
    },
    {
      element: '#tour-transport',
      popover: {
        title: 'How it sends',
        description:
          'Pick the transport — Device REST (simplest), HTTP channel, or MQTT — and fill the required fields (marked *).',
      },
    },
    {
      element: '#tour-vehicle',
      popover: {
        title: 'Vehicle state',
        description:
          'Optionally add CAN parameters (doors, lights, seatbelt, telemetry). Tick "Auto" on one to have the engine derive it from motion/stops; otherwise set it by hand.',
      },
    },
    {
      element: '#tour-save',
      popover: { title: 'Save', description: 'Save the simulator, then press ▶ on its card to run it.' },
    },
  ]
}

export function runTour() {
  start(mainSteps())
}

export function runDialogTour() {
  start(dialogSteps())
}

export function maybeStartFirstRunTour() {
  try {
    if (localStorage.getItem(MAIN_FLAG)) return
  } catch {
    return // localStorage unavailable
  }
  setTimeout(() => start(mainSteps(), MAIN_FLAG), 700) // let the layout settle
}

export function maybeStartDialogTour() {
  try {
    if (localStorage.getItem(DIALOG_FLAG)) return
  } catch {
    return
  }
  setTimeout(() => start(dialogSteps(), DIALOG_FLAG), 500) // let the dialog render
}
