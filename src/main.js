// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Pobieranie danych
const API_KEY = 'Q78BZD3Rj7as6gGcI2Pqr6SBvrwtPI5AU7RFyOQW';
const startDate = '2025-10-04';
const endDate = '2025-10-05';

// Lista obiektów NEO w scenie
const neos = [];

const dateSlider = document.getElementById('dateSlider');

dateSlider.addEventListener('change', () => {
  const selectedDate = dateSlider.value;
  console.log('Wybrana data:', selectedDate);

  // Czyścimy stare NEO
  neos.forEach(n => scene.remove(n));
  neos.length = 0;

  // Pobieramy dane dla nowej daty
  fetchNEOs(selectedDate);
});

let orbitsRunning = true; // sterowanie ruchem asteroid

const container = document.getElementById('app');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000);
camera.position.set(0, 2.5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// texture loader
const loader = new THREE.TextureLoader();
const earthMapUrl = new URL('./assets/earth.jpg', import.meta.url);
const earthMap = new THREE.TextureLoader().load(earthMapUrl.href);
const cloudsMap = loader.load('assets/earth_clouds.png'); // opcjonalnie

// Earth
const earthGeo = new THREE.SphereGeometry(1, 64, 64);
const earthMat = new THREE.MeshPhongMaterial({ map: earthMap });
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// Clouds (lekko większa kula, transparentna)
if (cloudsMap) {
  const cloudGeo = new THREE.SphereGeometry(1.01, 64, 64);
  const cloudMat = new THREE.MeshPhongMaterial({
    map: cloudsMap,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  scene.add(clouds);
  earth.userData.clouds = clouds;
}

// Proste gwiazdki (Points)
function makeStars(count = 10000) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 80; // radius
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[3*i]   = r * Math.sin(phi) * Math.cos(theta);
    positions[3*i+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[3*i+2] = r * Math.cos(phi);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ size: 0.5 });
  return new THREE.Points(geom, mat);
}
scene.add(makeStars());

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Resize
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// --- FUNKCJA DODAJĄCA ASTEROIDĘ Z PRAWDZIWYMI DANYMI ---
// Skalujemy pozycję i rozmiar, bo w realnych km to byłyby absurdalne liczby
function addNEO(name, sizeMeters, distanceKm, hazardous) {
  const scaleFactor = 0.00003; // skala rozmiaru
  const radius = Math.max(0.02, sizeMeters * scaleFactor);

  const distScale = 0.0000005; // skala odległości
  const dist = distanceKm * distScale + 2; // minimalna odległość od Ziemi

  // losowy kąt początkowy i nachylenie orbity
  const theta = Math.random() * 2 * Math.PI;
  const inclination = (Math.random() - 0.5) * 0.6; // nachylenie orbity

  const color = hazardous ? 0xff3333 : 0xff00c6;
  const geometry = new THREE.SphereGeometry(radius, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);

  // ustaw pozycję początkową
  const x = dist * Math.cos(theta);
  const y = dist * Math.sin(inclination);
  const z = dist * Math.sin(theta);
  mesh.position.set(x, y, z);

  // dane o orbicie (każda asteroida ma swoje tempo obrotu)
  mesh.userData = {
    name,
    size: sizeMeters,
    distance: distanceKm,
    hazardous,
    orbitRadius: dist,
    orbitSpeed: 0.2 + Math.random() * 0.3, // prędkość ruchu
    orbitAngle: theta,
    orbitInclination: inclination
  };

  scene.add(mesh);
  neos.push(mesh);
}


// --- POBIERANIE DANYCH NASA I DODAWANIE OBIEKTÓW ---
async function fetchNEOs(date) {
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${date}&end_date=${date}&api_key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();

    const neosForDate = data.near_earth_objects[date];
    neosForDate.forEach(neo => {
      const minSize = neo.estimated_diameter.meters.estimated_diameter_min;
      const maxSize = neo.estimated_diameter.meters.estimated_diameter_max;
      const avgSize = (minSize + maxSize) / 2;
      const approach = neo.close_approach_data?.[0];
      if (!approach) return;
      const distanceKm = parseFloat(approach.miss_distance.kilometers);
      const hazardous = neo.is_potentially_hazardous_asteroid;

      addNEO(neo.name, avgSize, distanceKm, hazardous);
    });

    console.log(`✅ Dodano wszystkie NEO dla daty ${date}`);
  } catch (err) {
    console.error('❌ Błąd pobierania danych NEO:', err);
  }
}

// Wywołanie początkowe dla daty startowej
fetchNEOs(startDate);


// --- INTERAKCJA: kliknięcie asteroidy ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const infoPanel = document.getElementById('infoPanel');

// Funkcja reagująca na kliknięcie
function onMouseClick(event) {
  // Przelicz współrzędne myszy na układ NDC (-1 do 1)
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Rzucamy promień w scenę
  raycaster.setFromCamera(mouse, camera);

  // Szukamy przecięć z obiektami w scenie
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    const hit = intersects[0].object;

    // Sprawdź, czy to asteroidka (ma userData.name)
    if (hit.userData && hit.userData.name) {
      const { name, size, distance, hazardous } = hit.userData;
      infoPanel.innerHTML = `
        <strong>${name}</strong><br>
        Średnica: ${size ? size.toFixed(1) : '?'} m<br>
        Odległość: ${distance ? distance.toFixed(0) : '?'} km<br>
        ${hazardous ? '<span style="color:red;">Niebezpieczna!</span>' : ''}
      `;
      infoPanel.style.display = 'block';
    }
  } else {
    infoPanel.style.display = 'none';
  }
}

window.addEventListener('click', onMouseClick);

// Animate
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  const d = clock.getDelta();

  earth.rotation.y += d * 0.2;
  if (earth.userData.clouds) earth.userData.clouds.rotation.y += d * 0.25;

  // Ruch asteroid po orbitach
  if (orbitsRunning) {
    neos.forEach(neo => {
      neo.userData.orbitAngle += neo.userData.orbitSpeed * d * 0.2;
      const r = neo.userData.orbitRadius;
      const inc = neo.userData.orbitInclination;
      neo.position.x = r * Math.cos(neo.userData.orbitAngle);
      neo.position.z = r * Math.sin(neo.userData.orbitAngle);
      neo.position.y = r * Math.sin(inc);
    });
  }

  controls.update();
  renderer.render(scene, camera);
})();

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    orbitsRunning = !orbitsRunning;
    console.log(`Orbity asteroid ${orbitsRunning ? 'włączone' : 'zatrzymane'}`);
  }
});