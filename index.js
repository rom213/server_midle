import express from 'express';
import expressWs from 'express-ws';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
expressWs(app);
app.use(bodyParser.json());

let isEsp32Online = false;

// Estado inicial de los botones con versión
const defaultButtonsState = {
  security: false,
  opendoor: false,
  offlights: false,
  alarm: false,
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

// Endpoint para recibir actualizaciones desde Flask
app.post('/update_buttons', (req, res) => {
  // Incrementa la versión cada vez que se actualiza el estado
  currentVersion++;
  buttonsState = { ...req.body, version: currentVersion };
  console.log('Received update from Flask:', buttonsState);
  res.json(buttonsState);
});

// WebSocket para comunicación con el ESP32
let tryit = 0;
app.ws('/echo', (ws) => {
  console.log('Client connected');
  isEsp32Online = true;
  let activityTimeout;

  // Enviar estado de botones al cliente cada 3 segundos solo si hubo cambio
  const sendButtonsState = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      // Solo se envía si la versión cambió
      if (lastSentVersion !== buttonsState.version) {
        try {
          ws.send(JSON.stringify(buttonsState));
          lastSentVersion = buttonsState.version;
        } catch (error) {
          console.error('Error al enviar datos por WebSocket:', error);
        }
      }
    } else {    
      console.log('WebSocket no está abierto.');
    }
  }, 3000);

  ws.on('message', (msg) => {
    clearTimeout(activityTimeout);
    try {
      console.log('Received from ESP32:', msg);
      const newState = JSON.parse(msg);

      // Si se trata de un heartbeat, se marca la conexión y se actualiza a Flask cada 4 heartbeats
      if (newState.hasOwnProperty('heartbeat')) {
        isEsp32Online = true;
        if (tryit === 4) {
          fetch('http://localhost:5001/socket/esp32_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ online: isEsp32Online })
          })
            .then(response => response.json())
            .then(data => console.log('Respuesta de Flask:', data))
            .catch(error => console.error('Error al enviar datos a Flask:', error));
          tryit = 0;
        }
        tryit++;
        return;
      }

      // Actualiza el estado recibido y aumenta la versión
      currentVersion++;
      buttonsState = { ...newState, version: currentVersion };

      // Enviar actualización al servidor Flask
      fetch('http://localhost:5001/socket/update_buttons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buttonsState)
      })
        .then(response => response.json())
        .then(data => console.log('Respuesta de Flask:', data))
        .catch(error => console.error('Error al enviar datos a Flask:', error));
    } catch (error) {
      console.error('Error al procesar mensaje del ESP32:', error);
    }

    // Reinicia temporizador de inactividad
    activityTimeout = setTimeout(() => {
      console.log('No hay actividad del ESP32. Restableciendo estado...');
      isEsp32Online = false;
      fetch('http://localhost:5001/socket/esp32_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: isEsp32Online })
      })
        .then(response => response.json())
        .then(data => console.log('Respuesta de Flask:', data))
        .catch(error => console.error('Error al enviar datos a Flask:', error));
    }, 10000);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(sendButtonsState);
    clearTimeout(activityTimeout);
    isEsp32Online = false;
    buttonsState = { ...defaultButtonsState };
    currentVersion++;
    buttonsState.version = currentVersion;
    fetch('http://localhost:5001/socket/esp32_update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: isEsp32Online })
    })
      .then(response => response.json())
      .then(data => console.log('Respuesta de Flask:', data))
      .catch(error => console.error('Error al enviar datos a Flask:', error));
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
