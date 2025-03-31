import express from 'express';
import expressWs from 'express-ws';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { io } from "socket.io-client";

const flaskSocket = io("http://localhost:3000"); // Conéctate a Flask

const app = express();
expressWs(app);
app.use(bodyParser.json());

let isEsp32Online = false;

const defaultButtonsState = {
  security: false,
  opendoor: false,
  offlights: false,
  alarm: false,
  signal_close_door: false,
  room: false,
  dinning: false,
  bathroom: false,
  yarn: false,
  closeDoor: false,
  ethernet: false,
  ethernet_state: false,
  version: 0 // Versión inicial
};

let buttonsState = { ...defaultButtonsState };
let currentVersion = 0; // Control de versión
let lastSentVersion = -1; // Para controlar envíos repetidos

// Funciones auxiliares para actualizar a Flask
const updateFlaskCheckEthernet = (online) => {
  fetch('http://localhost:3000/socket/check_ethernet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online })
  })
    .then(response => response.json())
    .then(data => console.log('Respuesta de Flask:', data))
    .catch(error => console.error('Error al enviar datos a Flask:', error));
};

const updateFlaskButtonsState = (state) => {
  fetch('http://localhost:3000/socket/update_buttons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  })
    .then(response => response.json())
    .then(data => console.log('Respuesta de Flask:', data))
    .catch(error => console.error('Error al enviar datos a Flask:', error));
};

// Endpoint para recibir actualizaciones desde Flask
app.post('/update_buttons', (req, res) => {
  currentVersion++;
  buttonsState = { ...req.body, version: currentVersion };
  console.log('Received update from Flask:', buttonsState);
  res.json(buttonsState);
});

// WebSocket para comunicación con el ESP32
app.ws('/echo', (ws) => {
  console.log('Client connected');
  isEsp32Online = true;
  let tryit = 0;
  let activityTimeout;

  // Envía el estado de botones cada 3 segundos si hubo cambio de versión
  const sendButtonsState = setInterval(() => {
    if (ws.readyState === ws.OPEN && lastSentVersion !== buttonsState.version) {
      try {
        ws.send(JSON.stringify(buttonsState));
        lastSentVersion = buttonsState.version;
      } catch (error) {
        console.error('Error al enviar datos por WebSocket:', error);
      }
    }
  }, 3000);

  // Función para reiniciar el temporizador de inactividad
  const resetActivityTimeout = () => {
    if (activityTimeout) clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
      console.log('No hay actividad del ESP32. Restableciendo estado...');
      isEsp32Online = false;
      updateFlaskCheckEthernet(isEsp32Online);
    }, 10000);
  };

  // Se inicia el temporizador al conectar
  resetActivityTimeout();



  function sendTemperature(temperature) {
    console.log("Sending temperature to Flask:", temperature);
    flaskSocket.emit("temperature", temperature); // Enviar la temperatura a Flask
}

  ws.on('message', (msg) => {
    resetActivityTimeout();
    try {
      console.log('Received from ESP32:', msg);
      const newState = JSON.parse(msg);

      // Si se recibe un heartbeat, se actualiza y cada 4 heartbeats se informa a Flask
      if (newState.hasOwnProperty('heartbeat')) {
        isEsp32Online = true;
        sendTemperature(newState.temperature)
        if (tryit === 4) {
          updateFlaskCheckEthernet(isEsp32Online);
          tryit = 0;
        } else {
          tryit++;
        }
        return;
      }

      // Actualiza el estado recibido y aumenta la versión
      currentVersion++;
      buttonsState = { ...newState, version: currentVersion };
      updateFlaskButtonsState(buttonsState);
    } catch (error) {
      console.error('Error al procesar mensaje del ESP32:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(sendButtonsState);
    clearTimeout(activityTimeout);
    isEsp32Online = false;
    buttonsState = { ...defaultButtonsState };
    currentVersion++;
    buttonsState.version = currentVersion;
    updateFlaskCheckEthernet(isEsp32Online);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clearInterval(sendButtonsState);
    clearTimeout(activityTimeout);
  });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});
