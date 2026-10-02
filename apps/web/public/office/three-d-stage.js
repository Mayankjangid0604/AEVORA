// <three-d-stage> — minimal Three.js stage used by Aevora_Office_3D_v3.html.
// Re-implements the stage API the office script relies on:
//   stage.ready → Promise<{ THREE }>
//   stage._scene, _camera, _controls (OrbitControls), _renderer, _key (shadow-casting sun),
//   stage._ground, stage._loop (default render loop), stage.setObject(obj)
// Three.js comes from the page's import map (dynamic import works from a classic script).

class ThreeDStage extends HTMLElement {
  constructor() {
    super();
    let resolve, reject;
    this.ready = new Promise((res, rej) => { resolve = res; reject = rej; });
    this._resolve = resolve;
    this._reject = reject;
  }

  connectedCallback() {
    if (this._started) return;
    this._started = true;
    this._init().catch((err) => { console.error('three-d-stage failed to start', err); this._reject(err); });
  }

  async _init() {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    this.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bg = new THREE.Color(this.getAttribute('background') || '#161826');
    scene.background = bg;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    camera.position.set(0, 40, 60);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 160;

    scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 0.6));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(20, 50, 25);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key, key.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: bg.clone().multiplyScalar(0.8), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    scene.add(ground);

    const resize = () => {
      const w = this.clientWidth || window.innerWidth;
      const h = this.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(this);
    resize();

    this._scene = scene;
    this._camera = camera;
    this._controls = controls;
    this._renderer = renderer;
    this._key = key;
    this._ground = ground;
    this._loop = () => { controls.update(); renderer.render(scene, camera); };
    renderer.setAnimationLoop(this._loop);

    this._resolve({ THREE, scene, camera, controls, renderer });
  }

  /** Put the page's model in the scene, replacing any previous one. */
  setObject(obj) {
    if (this._object) this._scene.remove(this._object);
    this._object = obj;
    this._scene.add(obj);
  }
}

if (!customElements.get('three-d-stage')) customElements.define('three-d-stage', ThreeDStage);
