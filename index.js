//base by greatgenie 
const {
   spawn
} = require('child_process')
COUPE_FACILE_USERNAME: 'votre_username',
COUPE_FACILE_PASSWORD: 'votre_password',
TOURNAMENT_ID: 'votre_tournament_id'
const path = require('path')
function start() {
   let args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)]
   console.log([process.argv[0], ...args].join('\n'))
   let p = spawn(process.argv[0], args, {
         stdio: ['inherit', 'inherit', 'inherit', 'ipc']
      })
      .on('message', data => {
         if (data == 'reset') {
            console.log('Restarting Bot...')
            p.kill()
            start()
            delete p
         }
      })
      .on('exit', code => {
         console.error('Exited with code:', code)
         if (code == '.' || code == 1 || code == 0) start()
      })
}
start()

// Ajoutez en haut avec les autres requires
+ const messageHandler = require('./handlers/message');

// Modifiez (ou ajoutez) le listener des messages :
client.on('message', async (message) => {
-  // Ancien code existant (ne pas supprimer !)
+  await messageHandler(message, client); // Nouveau handler
});
