/********************************************************
 * 
 * Macro Author:      	William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * Version: 1-0-0
 * Released: 06/12/24
 * 
 * This is an example macro which shows how to lock and unload the setting
 * menu via a PIN prompt using a UI Extension Lock and Unload button in 
 * the device Control Panel menu.
 * 
 * This macro also features custom icons which are downloaded to the device.
 * 
 * Lastly, the macro can be configured to automatically lock the device
 * upon entering standby, halfwake or after a room clean up
 * 
 * Full Readme, source code and license details for this macro are available 
 * on Github: https://github.com/wxsd-sales/settings-lock-macro
 * 
 ********************************************************/

import xapi from 'xapi';

/*********************************************************
 * Configure the settings below
**********************************************************/

const config = {
  pin: '1234',
  button: {
    lock: {
      name: 'Lock Settings',
      icon: 'https://wxsd-sales.github.io/settings-lock-macro/images/locked.png'
    },
    unlock: {
      name: 'Unlock Settings',
      icon: 'https://wxsd-sales.github.io/settings-lock-macro/images/unlocked.png'
    }
  },
  autoLock: {
    enteringStandby: true,      // Auto lock settings upon entering Standby
    enteringHalfwake: true,     // Auto lock settings upon entering Halfwake
    uponRoomCleanup: true       // Auto lock settings upon Room Cleanup Event
  },
  panelId: 'settingslock'
}


/*********************************************************
 * Do not change below
**********************************************************/

// This is our main function which initializes everything
async function main() {

  // Create our Button and UI Panel
  await createButton();
  xapi.Config.UserInterface.SettingsMenu.Mode.on(createButton);

  // Subscribe to  Panel Click events
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(async event => {
    if (!event.PanelId.startsWith(config.panelId)) return;
    if (await checkSettingsLocked()) {
      console.log(`[${config.panelId}] Clicked - Settings currently locked - Prompting For PIN`)
      askForPIN();
    } else {
      console.log(`[${config.panelId}] Clicked - Settings currently unlocked - Now locking settings`)
      setSettingsMenu('Locked');
      createButton();
    }
  });

  // Subscribe to Text Inputs and Prompt Responses
  xapi.Event.UserInterface.Message.TextInput.Response.on(processTextResponse)

  xapi.Status.Standby.State.on(async state => {
    console.log('Standby State Changed To: ', state)

    // Take no action if settings are already locked
    if (await checkSettingsLocked()) return

    if (state === 'EnteringStandby' || state === 'Standby') {
      if (config.autoLock.enteringStandby) setSettingsMenu('Locked');
      return
    }

    if (state === 'Halfwake' && config.autoLock.enteringHalfwake) {
      setSettingsMenu('Locked');
      return
    }

  });

  xapi.Event.RoomCleanup.Complete.on(event => {
    console.debug('Cleanup Event:', event.Result)
    if (event == 'success' && config.autoLock.uponRoomCleanup) {
      setSettingsMenu('Locked');
    }

  });

  // Subscribe to Room Clean and Standby Events for Debug Logging
  xapi.Event.RoomCleanup.Complete
    .on(event => console.debug('Cleanup Result:', event.Result));
  xapi.Event.Standby.SecondsToStandby
    .on(event => console.debug('Seconds To Standby:', event));
  xapi.Event.Standby.Reset
    .on(event => console.debug('Standby Reset Event:', event));
}

main();

/*********************************************************
 * Below are the function which this macro uses
**********************************************************/


function checkSettingsLocked() {
  return xapi.Config.UserInterface.SettingsMenu.Mode.get().then(result => result === 'Locked')
}

function setSettingsMenu(mode) {
  console.log('Setting Kiosk Mode To:', mode);
  xapi.Config.UserInterface.SettingsMenu.Mode.set(mode);
}


function processTextResponse(event) {
  if (!event.FeedbackId.startsWith(config.panelId)) return;
  const responseType = event.FeedbackId.split('-').pop();
  switch (responseType) {
    case 'pin':
      if (event.Text == config.pin) {
        console.log('Valid PIN Entered - Unlocking Settings Menu');
        setSettingsMenu('Unlocked');
        return;
      } else {
        console.log('Invalid PIN Entered - Displaying Invalid PIN Alert');
        xapi.Command.UserInterface.Message.Alert.Display(
          { Duration: 5, Text: 'The PIN entered was invalid<br> please try again', Title: 'Invalid PIN' });
      }
      break;
  }
}


function askForPIN() {
  xapi.Command.UserInterface.Message.TextInput.Display({
    FeedbackId: config.panelId + '-pin',
    InputType: 'PIN',
    Placeholder: 'Please Enter PIN',
    SubmitText: 'Submit',
    Text: 'Please Enter PIN',
    Title: config.button.name
  });
}


// This function creates initial buttons which can open the hidden panel
async function createButton() {

  const state = await checkSettingsLocked() ? 'unlock' : 'lock';
  const button = config.button[state];
  const panelId = config.panelId;

  const order = await panelOrder(panelId)
  const icon = button.icon.startsWith('http') ? await getIcon(button.icon) : `<Icon>${button.icon}</Icon>`;
  const color = button?.color ?? '';

  const panel = `<Extensions><Panel>
                  <Location>ControlPanel</Location>
                  ${icon}
                  ${color}
                  <Name>${button.name}</Name>
                  ${order}
                  <ActivityType>Custom</ActivityType>
                </Panel></Extensions>`;
  await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel)
    .catch(error => console.log(`Unable to save panel [${panelId}] - `, error.Message))

}


/*********************************************************
 * Downloads Icon from provided URL and returns the 
 * Icon Id as the required UI Extension XML string
 **********************************************************/
function getIcon(url) {
  return xapi.Command.UserInterface.Extensions.Icon.Download({ Url: url })
    .then(result => `<Icon>Custom</Icon><CustomIcon><Id>${result.IconId}</Id></CustomIcon>`)
    .catch(error => {
      console.log('Unable to download icon: ' + error.message)
      return false
    })
}

/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return -1
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return -1
  return existingPanel.Order
}