import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundSynth } from '../audio/synth';
import { isValidGridCoord } from '../game/rules';
import { DIE_COLS, DIE_ROWS, GATE_SPECS } from '../game/stages';
import {
  ChipStage,
  GameScreenState,
  GateType,
  PlacedCell,
  SimulationReport,
} from '../game/types';
import {
  CELL_PITCH,
  DIE_ORIGIN_X,
  DIE_ORIGIN_Z,
  DIE_SURFACE_Y,
  TRAY_Z,
  buildManhattanWireGroup,
  createBondPadMesh,
  createGateCapTexture,
  createStandardCellMesh,
  createWaferSurfaceTexture,
  gridToWorld,
  worldToGrid,
} from '../three/proceduralModels';
import {
  XRControllerCallbacks,
  attachXRControllers,
  launchXRSession,
} from '../xr/xrManager';

export interface SiliconCanvasHandle {
  enterXR: (mode: 'immersive-vr' | 'immersive-ar') => Promise<{ ok: boolean; error?: string }>;
  resetCamera: () => void;
  triggerSignoffPulse: () => void;
}

interface SiliconCanvasProps {
  screenState: GameScreenState;
  stage: ChipStage;
  placedCells: PlacedCell[];
  simulation: SimulationReport;
  selectedPaletteGate: GateType;
  spatialTabletopMode: boolean;
  arPassthroughPreview: boolean;
  domOverlayRef: React.RefObject<HTMLDivElement | null>;
  canvasApiRef: React.MutableRefObject<SiliconCanvasHandle | null>;
  onSelectPaletteGate: (gate: GateType) => void;
  onPlaceOrMoveCell: (cell: PlacedCell) => void;
  onRemoveCell: (id: string) => void;
  onHoverCoordChange: (coord: { col: number; row: number } | null) => void;
  onXRModeChange: (mode: 'none' | 'immersive-vr' | 'immersive-ar') => void;
}

// Pre-allocated scratch math objects (zero allocations inside tick)
const _pointerNdc = new THREE.Vector2();
const _planeHit = new THREE.Vector3();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DIE_SURFACE_Y);
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _particlePos = new THREE.Vector3();
const _particleQuat = new THREE.Quaternion();
const _particleScale = new THREE.Vector3(1, 1, 1);
const _particleMat4 = new THREE.Matrix4();
const _logicOneEmissive = new THREE.Color(0x38bdf8);
const _logicZeroEmissive = new THREE.Color(0x000000);

const MAX_PULSE_PARTICLES = 96;

export function SiliconCanvas({
  screenState,
  stage,
  placedCells,
  simulation,
  selectedPaletteGate,
  spatialTabletopMode,
  arPassthroughPreview,
  domOverlayRef,
  canvasApiRef,
  onSelectPaletteGate,
  onPlaceOrMoveCell,
  onRemoveCell,
  onHoverCoordChange,
  onXRModeChange,
}: SiliconCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store mutable React props/callbacks in refs so WebGLRenderer mounts ONCE
  const propsRef = useRef({
    screenState,
    stage,
    placedCells,
    simulation,
    selectedPaletteGate,
    spatialTabletopMode,
    arPassthroughPreview,
    onSelectPaletteGate,
    onPlaceOrMoveCell,
    onRemoveCell,
    onHoverCoordChange,
    onXRModeChange,
  });
  propsRef.current = {
    screenState,
    stage,
    placedCells,
    simulation,
    selectedPaletteGate,
    spatialTabletopMode,
    arPassthroughPreview,
    onSelectPaletteGate,
    onPlaceOrMoveCell,
    onRemoveCell,
    onHoverCoordChange,
    onXRModeChange,
  };

  const sceneSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect software WebGL (SwiftShader / llvmpipe) cleanly from renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

    const initialRect = container.getBoundingClientRect();
    const initW = Math.max(1, initialRect.width || window.innerWidth);
    const initH = Math.max(1, initialRect.height || window.innerHeight);
    renderer.setSize(initW, initH);
    renderer.domElement.dataset.testid = 'silicon-webgl-canvas';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgDark = new THREE.Color(0x090d16);
    scene.background = bgDark;
    scene.fog = new THREE.FogExp2(0x090d16, 0.028);

    // Mandatory studio PBR environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(43, initW / initH, 0.1, 120);
    camera.position.set(0, 9.6, 10.6);
    camera.lookAt(0, 0.1, 0.95);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 4.5;
    controls.maxDistance = 19;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.set(0, 0.1, 0.95);
    // Dedicate Left-Drag exclusively to 3D chip drag-and-drop; Right-Drag & Middle-Wheel control camera
    controls.mouseButtons = {
      LEFT: -1 as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    let cameraPresetTransition = false;
    controls.addEventListener('start', () => {
      cameraPresetTransition = false;
    });

    // 2. Warm/Cool 3-Point Cleanroom Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e1b4b, 0.72);
    hemiLight.position.set(0, 18, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 1.85);
    keyLight.position.set(7.5, 13, 8.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    const shadowD = 8.5;
    keyLight.shadow.camera.left = -shadowD;
    keyLight.shadow.camera.right = shadowD;
    keyLight.shadow.camera.top = shadowD;
    keyLight.shadow.camera.bottom = -shadowD;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 32;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-8, 6, -9);
    scene.add(rimLight);

    // 3. Cleanroom Optical Bench, 300mm Silicon Wafer Chuck & 6x6 Die Substrate
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const waferTex = createWaferSurfaceTexture(maxAniso);

    const worldRoot = new THREE.Group();
    scene.add(worldRoot);

    // Granite anti-vibration optical bench surface
    const benchMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(9.6, 10.2, 0.5, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.82,
        metalness: 0.18,
      }),
    );
    benchMesh.position.y = -0.46;
    benchMesh.receiveShadow = true;
    worldRoot.add(benchMesh);

    // Brushed aluminum wafer vacuum chuck ring
    const chuckRing = new THREE.Mesh(
      new THREE.CylinderGeometry(6.35, 6.55, 0.18, 48),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.3,
        metalness: 0.85,
      }),
    );
    chuckRing.position.set(0, -0.11, -0.2);
    chuckRing.receiveShadow = true;
    worldRoot.add(chuckRing);

    // 300mm Silicon Wafer Disc
    const waferDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(6.05, 6.05, 0.08, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: waferTex,
        roughness: 0.2,
        metalness: 0.65,
      }),
    );
    waferDisc.position.set(0, 0.02, -0.2);
    waferDisc.receiveShadow = true;
    worldRoot.add(waferDisc);

    // 4 Cleanroom Micro-Probe Corner Stanchions (landmark silhouettes on the bench)
    const stanchionGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.65, 16);
    const stanchionMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.32,
      metalness: 0.82,
    });
    const armGeo = new THREE.BoxGeometry(0.75, 0.09, 0.16);
    [
      [-5.1, -4.6],
      [5.1, -4.6],
      [-5.1, 3.9],
      [5.1, 3.9],
    ].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(stanchionGeo, stanchionMat);
      post.position.set(sx, 0.12, sz);
      const arm = new THREE.Mesh(armGeo, stanchionMat);
      arm.position.set(sx > 0 ? sx - 0.32 : sx + 0.32, 0.42, sz);
      arm.rotation.y = Math.atan2(-sz, -sx);
      worldRoot.add(post, arm);
    });

    // Active 6x6 Silicon Die Substrate Package
    const dieW = DIE_COLS * CELL_PITCH + 0.45;
    const dieD = DIE_ROWS * CELL_PITCH + 0.45;
    const dieCenterZ = DIE_ORIGIN_Z + ((DIE_ROWS - 1) * CELL_PITCH) / 2;

    const dieBase = new THREE.Mesh(
      new THREE.BoxGeometry(dieW, 0.16, dieD),
      new THREE.MeshStandardMaterial({
        color: 0x0b1324,
        roughness: 0.45,
        metalness: 0.4,
      }),
    );
    dieBase.position.set(0, 0.14, dieCenterZ);
    dieBase.receiveShadow = true;
    worldRoot.add(dieBase);

    // VDD (North Red-Gold) & VSS (South Cobalt) Power Supply Rails
    const vddRail = new THREE.Mesh(
      new THREE.BoxGeometry(dieW - 0.2, 0.04, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.25,
        metalness: 0.9,
      }),
    );
    vddRail.position.set(0, DIE_SURFACE_Y + 0.02, dieCenterZ - dieD / 2 + 0.14);
    const vssRail = new THREE.Mesh(
      new THREE.BoxGeometry(dieW - 0.2, 0.04, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.25,
        metalness: 0.9,
      }),
    );
    vssRail.position.set(0, DIE_SURFACE_Y + 0.02, dieCenterZ + dieD / 2 - 0.14);
    worldRoot.add(vddRail, vssRail);

    // Instanced 6x6 Silicon Grid Sockets (36 tiles -> InstancedMesh)
    const tileSocketGeo = new THREE.BoxGeometry(CELL_PITCH * 0.88, 0.02, CELL_PITCH * 0.88);
    const tileSocketMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
    });
    const socketInstanced = new THREE.InstancedMesh(
      tileSocketGeo,
      tileSocketMat,
      DIE_COLS * DIE_ROWS,
    );
    socketInstanced.receiveShadow = true;
    let idxCounter = 0;
    for (let r = 0; r < DIE_ROWS; r++) {
      for (let c = 0; c < DIE_COLS; c++) {
        const { x, z } = gridToWorld(c, r);
        _particlePos.set(x, DIE_SURFACE_Y + 0.01, z);
        _particleQuat.identity();
        _particleScale.set(1, 1, 1);
        _particleMat4.compose(_particlePos, _particleQuat, _particleScale);
        socketInstanced.setMatrixAt(idxCounter++, _particleMat4);
      }
    }
    socketInstanced.instanceMatrix.needsUpdate = true;
    socketInstanced.computeBoundingSphere();
    worldRoot.add(socketInstanced);

    // Front In-World ESD Component Tray (for direct 3D drag-and-drop!)
    const trayDockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.14, 1.35),
      new THREE.MeshStandardMaterial({
        color: 0x162033,
        roughness: 0.62,
        metalness: 0.35,
      }),
    );
    trayDockMesh.position.set(0, 0.13, TRAY_Z);
    trayDockMesh.receiveShadow = true;
    worldRoot.add(trayDockMesh);

    // Pre-generate shared gate cap textures
    const gateCapTextures = new Map<GateType, THREE.CanvasTexture>();
    (Object.keys(GATE_SPECS) as GateType[]).forEach((gt) => {
      gateCapTextures.set(gt, createGateCapTexture(gt, maxAniso));
    });

    // Hover & Snap Magnetic Reticle Ring on Die
    const hoverRingGeo = new THREE.RingGeometry(0.42, 0.5, 4);
    hoverRingGeo.rotateX(-Math.PI / 2);
    hoverRingGeo.rotateY(Math.PI / 4);
    const hoverRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hoverRing = new THREE.Mesh(hoverRingGeo, hoverRingMat);
    hoverRing.position.y = DIE_SURFACE_Y + 0.03;
    hoverRing.visible = false;
    worldRoot.add(hoverRing);

    // Dynamic Groups managed via sceneSync
    const padsGroup = new THREE.Group();
    const trayItemsGroup = new THREE.Group();
    const placedCellsGroup = new THREE.Group();
    const wiresContainer = new THREE.Group();
    const dragGhostGroup = new THREE.Group();
    dragGhostGroup.visible = false;
    worldRoot.add(padsGroup, trayItemsGroup, placedCellsGroup, wiresContainer, dragGhostGroup);

    // Pooled InstancedMesh for Electron Signal Carrier Pulses along active wires
    const pulseGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const pulseInstanced = new THREE.InstancedMesh(pulseGeo, pulseMat, MAX_PULSE_PARTICLES);
    pulseInstanced.frustumCulled = false;
    pulseInstanced.count = 0;
    worldRoot.add(pulseInstanced);

    // Raycastable proxy arrays (fast raycasting against small list!)
    interface ProxyTarget {
      mesh: THREE.Mesh;
      kind: 'tray' | 'placed';
      gateType: GateType;
      cellId?: string;
      originCol?: number;
      originRow?: number;
    }
    let interactableProxies: ProxyTarget[] = [];
    const proxyGeo = new THREE.BoxGeometry(1.12, 0.62, 1.15);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    let activeWireRoutes: Array<{
      start: THREE.Vector3;
      corner: THREE.Vector3;
      end: THREE.Vector3;
      signal: 0 | 1;
    }> = [];

    let padDisposeTextures: THREE.CanvasTexture[] = [];
    let currentStageId = '';
    let signoffBurstTimer = 0;

    // Drag state
    let dragState: {
      active: boolean;
      sourceKind: 'tray' | 'placed';
      gateType: GateType;
      cellId: string;
      startX: number;
      startZ: number;
      currentX: number;
      currentZ: number;
      movedEnough: boolean;
    } | null = null;

    const rebuildGhostMesh = (gateType: GateType) => {
      while (dragGhostGroup.children.length > 0) {
        dragGhostGroup.remove(dragGhostGroup.children[0]);
      }
      const tex = gateCapTextures.get(gateType)!;
      const { group } = createStandardCellMesh(gateType, tex, false);
      dragGhostGroup.add(group);
    };

    // Synchronize Three.js meshes whenever stage, placedCells, or simulation updates
    const syncSceneFromProps = () => {
      const {
        stage: st,
        placedCells: cells,
        simulation: sim,
        arPassthroughPreview: arPreview,
      } = propsRef.current;

      // Toggle AR cleanroom passthrough background
      if (arPreview && !renderer.xr.isPresenting) {
        scene.background = new THREE.Color(0x111827);
        scene.fog = null;
      } else if (!renderer.xr.isPresenting) {
        scene.background = bgDark;
        scene.fog = new THREE.FogExp2(0x090d16, 0.028);
      }

      // Rebuild Pads & Tray if Stage changed
      if (st.id !== currentStageId) {
        currentStageId = st.id;
        padDisposeTextures.forEach((t) => t.dispose());
        padDisposeTextures = [];
        while (padsGroup.children.length > 0) {
          padsGroup.remove(padsGroup.children[0]);
        }
        [...st.inputPads, ...st.outputPads].forEach((pad) => {
          const { group, signalMat, tex } = createBondPadMesh(pad, maxAniso);
          group.userData.padId = pad.id;
          group.userData.signalMat = signalMat;
          padsGroup.add(group);
          padDisposeTextures.push(tex);
        });
      }

      // Update pad active signal LEDs
      padsGroup.children.forEach((child) => {
        const padId = child.userData.padId as string | undefined;
        const sigMat = child.userData.signalMat as THREE.MeshStandardMaterial | undefined;
        if (padId && sigMat) {
          const val = sim.padSignals[padId] ?? 0;
          sigMat.color.setHex(val === 1 ? 0x38bdf8 : 0x334155);
          sigMat.emissive.copy(val === 1 ? _logicOneEmissive : _logicZeroEmissive);
          sigMat.emissiveIntensity = val === 1 ? 0.75 : 0;
        }
      });

      // Rebuild Tray & Placed Cells + Interactable Proxies
      interactableProxies = [];
      while (trayItemsGroup.children.length > 0) {
        trayItemsGroup.remove(trayItemsGroup.children[0]);
      }
      while (placedCellsGroup.children.length > 0) {
        placedCellsGroup.remove(placedCellsGroup.children[0]);
      }

      const avail = st.availableGates;
      const traySpacing = 1.22;
      const trayStartX = -((avail.length - 1) * traySpacing) / 2;

      avail.forEach((gt, idx) => {
        const tx = trayStartX + idx * traySpacing;
        const { group } = createStandardCellMesh(
          gt,
          gateCapTextures.get(gt)!,
          !isSoftwareGl,
        );
        group.position.set(tx, 0.2, TRAY_Z);
        const isSelected = propsRef.current.selectedPaletteGate === gt;
        if (isSelected) {
          group.position.y = 0.28;
        }
        trayItemsGroup.add(group);

        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.position.set(tx, 0.36, TRAY_Z);
        trayItemsGroup.add(proxy);
        interactableProxies.push({
          mesh: proxy,
          kind: 'tray',
          gateType: gt,
        });
      });

      cells.forEach((cell) => {
        const { x, z } = gridToWorld(cell.col, cell.row);
        const { group, statusLedMat } = createStandardCellMesh(
          cell.type,
          gateCapTextures.get(cell.type)!,
          !isSoftwareGl,
        );
        group.position.set(x, DIE_SURFACE_Y, z);
        const sig = sim.cellSignals[cell.id] ?? 0;
        statusLedMat.color.setHex(sig === 1 ? 0x38bdf8 : 0x334155);
        statusLedMat.emissive.copy(sig === 1 ? _logicOneEmissive : _logicZeroEmissive);
        statusLedMat.emissiveIntensity = sig === 1 ? 0.85 : 0;
        placedCellsGroup.add(group);

        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.position.set(x, DIE_SURFACE_Y + 0.22, z);
        placedCellsGroup.add(proxy);
        interactableProxies.push({
          mesh: proxy,
          kind: 'placed',
          gateType: cell.type,
          cellId: cell.id,
          originCol: cell.col,
          originRow: cell.row,
        });
      });

      // Rebuild Manhattan Metal-1 / Metal-2 Traces
      while (wiresContainer.children.length > 0) {
        wiresContainer.remove(wiresContainer.children[0]);
      }
      const { group: wireGroup, routes } = buildManhattanWireGroup(sim.wires);
      wiresContainer.add(wireGroup);
      activeWireRoutes = routes;
    };

    sceneSyncRef.current = syncSceneFromProps;
    syncSceneFromProps();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Unified Ray Interaction Logic (Shared across Mouse, Touch, and WebXR Laser Stylus!)
    const raycaster = new THREE.Raycaster();

    const handleRayDown = (ray: THREE.Ray): boolean => {
      if (propsRef.current.screenState !== 'playing') return false;
      raycaster.ray.copy(ray);

      const proxyMeshes = interactableProxies.map((p) => p.mesh);
      const hits = raycaster.intersectObjects(proxyMeshes, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        const target = interactableProxies.find((p) => p.mesh === hitMesh);
        if (target) {
          ray.intersectPlane(_dragPlane, _planeHit);
          const id =
            target.kind === 'tray'
              ? `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
              : target.cellId!;

          if (target.kind === 'tray') {
            propsRef.current.onSelectPaletteGate(target.gateType);
          }

          dragState = {
            active: true,
            sourceKind: target.kind,
            gateType: target.gateType,
            cellId: id,
            startX: _planeHit.x,
            startZ: _planeHit.z,
            currentX: _planeHit.x,
            currentZ: _planeHit.z,
            movedEnough: false,
          };

          rebuildGhostMesh(target.gateType);
          dragGhostGroup.position.set(_planeHit.x, DIE_SURFACE_Y + 0.32, _planeHit.z);
          dragGhostGroup.visible = true;
          controls.enabled = false;
          soundSynth.playPickup();
          return true;
        }
      }

      // Also check exact grid-plane hit: picks up occupied cell OR places selected gate on empty socket
      if (ray.intersectPlane(_dragPlane, _planeHit)) {
        const { col, row } = worldToGrid(_planeHit.x, _planeHit.z);
        if (isValidGridCoord(col, row)) {
          const occupied = propsRef.current.placedCells.find(
            (c) => c.col === col && c.row === row,
          );
          if (occupied) {
            const snapped = gridToWorld(col, row);
            dragState = {
              active: true,
              sourceKind: 'placed',
              gateType: occupied.type,
              cellId: occupied.id,
              startX: _planeHit.x,
              startZ: _planeHit.z,
              currentX: snapped.x,
              currentZ: snapped.z,
              movedEnough: false,
            };
            rebuildGhostMesh(occupied.type);
            dragGhostGroup.position.set(snapped.x, DIE_SURFACE_Y + 0.32, snapped.z);
            dragGhostGroup.visible = true;
            controls.enabled = false;
            soundSynth.playPickup();
            return true;
          } else {
            propsRef.current.onPlaceOrMoveCell({
              id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: propsRef.current.selectedPaletteGate,
              col,
              row,
            });
            soundSynth.playSnapPlace(true);
            return true;
          }
        }
      }

      return false;
    };

    const handleRayMove = (ray: THREE.Ray) => {
      if (propsRef.current.screenState !== 'playing') {
        hoverRing.visible = false;
        return;
      }

      if (ray.intersectPlane(_dragPlane, _planeHit)) {
        const { col, row } = worldToGrid(_planeHit.x, _planeHit.z);
        const valid = isValidGridCoord(col, row);

        if (valid) {
          const snapped = gridToWorld(col, row);
          hoverRing.position.set(snapped.x, DIE_SURFACE_Y + 0.035, snapped.z);
          hoverRing.visible = true;
          hoverRingMat.color.setHex(dragState?.active ? 0xfbbf24 : 0x38bdf8);
          propsRef.current.onHoverCoordChange({ col, row });
        } else {
          hoverRing.visible = false;
          propsRef.current.onHoverCoordChange(null);
        }

        if (dragState?.active) {
          const dx = _planeHit.x - dragState.startX;
          const dz = _planeHit.z - dragState.startZ;
          if (dx * dx + dz * dz > 0.04) {
            dragState.movedEnough = true;
          }
          if (valid) {
            const snapped = gridToWorld(col, row);
            dragState.currentX = snapped.x;
            dragState.currentZ = snapped.z;
          } else {
            dragState.currentX = _planeHit.x;
            dragState.currentZ = _planeHit.z;
          }
        }
      }
    };

    const handleRayUp = (ray: THREE.Ray) => {
      if (!dragState?.active) return;
      const finished = dragState;
      dragState = null;
      dragGhostGroup.visible = false;
      controls.enabled = true;

      if (ray.intersectPlane(_dragPlane, _planeHit)) {
        const { col, row } = worldToGrid(_planeHit.x, _planeHit.z);
        if (isValidGridCoord(col, row)) {
          propsRef.current.onPlaceOrMoveCell({
            id: finished.cellId,
            type: finished.gateType,
            col,
            row,
          });
          soundSynth.playSnapPlace(true);
          return;
        }
      }

      // Dropped outside the 6x6 silicon die: if it was a placed cell and dragged off, remove it!
      if (finished.sourceKind === 'placed' && finished.movedEnough) {
        propsRef.current.onRemoveCell(finished.cellId);
        soundSynth.playRemove();
      }
    };

    // Pointer Events on Canvas
    const updateRayFromPointer = (clientX: number, clientY: number): THREE.Ray => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(_pointerNdc, camera);
      return raycaster.ray;
    };

    let lastHoverTime = 0;
    let rightDownPos: { x: number; y: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        rightDownPos = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      const ray = updateRayFromPointer(e.clientX, e.clientY);
      handleRayDown(ray);
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (!dragState?.active && now - lastHoverTime < 35) return;
      lastHoverTime = now;
      const ray = updateRayFromPointer(e.clientX, e.clientY);
      handleRayMove(ray);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ray = updateRayFromPointer(e.clientX, e.clientY);
      handleRayUp(ray);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (propsRef.current.screenState !== 'playing') return;
      if (rightDownPos) {
        const dx = e.clientX - rightDownPos.x;
        const dy = e.clientY - rightDownPos.y;
        rightDownPos = null;
        if (dx * dx + dy * dy > 36) {
          // User right-dragged to orbit the camera; do not delete cell
          return;
        }
      }
      const ray = updateRayFromPointer(e.clientX, e.clientY);
      if (ray.intersectPlane(_dragPlane, _planeHit)) {
        const { col, row } = worldToGrid(_planeHit.x, _planeHit.z);
        const existing = propsRef.current.placedCells.find(
          (c) => c.col === col && c.row === row,
        );
        if (existing) {
          propsRef.current.onRemoveCell(existing.id);
          soundSynth.playRemove();
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Attach WebXR 3D Controllers
    const xrCallbacksRef: { current: XRControllerCallbacks } = {
      current: {
        onRayStart: (ray) => {
          handleRayDown(ray);
        },
        onRayMove: (ray) => {
          handleRayMove(ray);
        },
        onRayEnd: (ray) => {
          handleRayUp(ray);
        },
      },
    };
    const { updateControllers, disposeControllers } = attachXRControllers(
      renderer,
      scene,
      xrCallbacksRef,
    );

    // Expose imperative handle for XR entry, camera reset, and signoff burst
    canvasApiRef.current = {
      enterXR: async (mode) => {
        const res = await launchXRSession(
          mode,
          renderer,
          domOverlayRef.current,
          (activeMode) => {
            if (activeMode === 'immersive-ar') {
              scene.background = null;
              scene.fog = null;
              renderer.setClearAlpha(0);
              worldRoot.scale.setScalar(0.085);
              worldRoot.position.set(0, 0.75, -0.65);
            } else if (activeMode === 'immersive-vr') {
              scene.background = bgDark;
              renderer.setClearAlpha(1);
              worldRoot.scale.setScalar(0.14);
              worldRoot.position.set(0, 0.85, -0.75);
            } else {
              scene.background = bgDark;
              scene.fog = new THREE.FogExp2(0x090d16, 0.028);
              renderer.setClearAlpha(1);
              worldRoot.scale.setScalar(1);
              worldRoot.position.set(0, 0, 0);
            }
            propsRef.current.onXRModeChange(activeMode);
          },
        );
        return res;
      },
      resetCamera: () => {
        cameraPresetTransition = true;
      },
      triggerSignoffPulse: () => {
        signoffBurstTimer = 1.2;
      },
    };

    // ResizeObserver for crisp responsive viewport bounds
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || renderer.xr.isPresenting) return;
      const w = Math.max(1, entry.contentRect.width);
      const h = Math.max(1, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation Loop with Software-WebGL fenceSync Pacing & WebXR Handoff
    let lastFrameMs = performance.now();
    let elapsedSec = 0;
    let frameId = 0;
    let unmounted = false;
    let titleOrbitAngle = 0.35;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (unmounted) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const stepScene = () => {
      const nowMs = performance.now();
      const rawDt = Math.max(0, (nowMs - lastFrameMs) / 1000);
      lastFrameMs = nowMs;
      const dt = Math.min(rawDt, 0.05);
      elapsedSec += dt;
      const elapsed = elapsedSec;
      const curState = propsRef.current.screenState;

      if (!renderer.xr.isPresenting) {
        if (curState === 'title') {
          // Stage Approach 2: Interactive Hero Showcase gentle turntable orbit
          titleOrbitAngle += dt * 0.22;
          const radius = 11.4;
          _camTargetPos.set(
            Math.sin(titleOrbitAngle) * radius * 0.65 + 2.2,
            8.4,
            Math.cos(titleOrbitAngle) * radius * 0.72 + 2.5,
          );
          _camLookTarget.set(-1.1, 0.15, 0.3);
          const alpha = 1 - Math.exp(-3.5 * dt);
          camera.position.lerp(_camTargetPos, alpha);
          controls.target.lerp(_camLookTarget, alpha);
          camera.lookAt(controls.target);
          cameraPresetTransition = true;
        } else if (cameraPresetTransition || propsRef.current.spatialTabletopMode) {
          if (propsRef.current.spatialTabletopMode) {
            _camTargetPos.set(0, 5.4, 8.2);
            _camLookTarget.set(0, 0.2, 0.85);
          } else {
            _camTargetPos.set(0, 9.6, 10.6);
            _camLookTarget.set(0, 0.1, 0.95);
          }
          const alpha = 1 - Math.exp(-5.0 * dt);
          camera.position.lerp(_camTargetPos, alpha);
          controls.target.lerp(_camLookTarget, alpha);
          if (
            !propsRef.current.spatialTabletopMode &&
            camera.position.distanceToSquared(_camTargetPos) < 0.01
          ) {
            cameraPresetTransition = false;
          }
          controls.update();
        } else if (controls.enableDamping) {
          controls.update();
        }
      } else {
        updateControllers();
      }

      // Smoothly damp dragged 3D gate ghost
      if (dragState?.active && dragGhostGroup.visible) {
        const dampAlpha = 1 - Math.exp(-18 * dt);
        dragGhostGroup.position.x = THREE.MathUtils.lerp(
          dragGhostGroup.position.x,
          dragState.currentX,
          dampAlpha,
        );
        dragGhostGroup.position.z = THREE.MathUtils.lerp(
          dragGhostGroup.position.z,
          dragState.currentZ,
          dampAlpha,
        );
        dragGhostGroup.position.y = DIE_SURFACE_Y + 0.34 + Math.sin(elapsed * 8) * 0.03;
      }

      // Update pooled electron charge carrier particles along active Metal-1/2 wires
      if (signoffBurstTimer > 0) {
        signoffBurstTimer = Math.max(0, signoffBurstTimer - dt);
      }
      const speedMul = signoffBurstTimer > 0 ? 3.2 : 1.35;

      let pCount = 0;
      for (let i = 0; i < activeWireRoutes.length; i++) {
        const r = activeWireRoutes[i];
        if (r.signal !== 1 && signoffBurstTimer <= 0) continue;
        for (let k = 0; k < 3; k++) {
          if (pCount >= MAX_PULSE_PARTICLES) break;
          const t = (elapsed * speedMul + k * 0.33 + i * 0.17) % 1;
          if (t < 0.5) {
            _particlePos.lerpVectors(r.start, r.corner, t * 2);
          } else {
            _particlePos.lerpVectors(r.corner, r.end, (t - 0.5) * 2);
          }
          const s = signoffBurstTimer > 0 ? 1.45 : 1.0;
          _particleScale.setScalar(s);
          _particleQuat.identity();
          _particleMat4.compose(_particlePos, _particleQuat, _particleScale);
          pulseInstanced.setMatrixAt(pCount++, _particleMat4);
        }
      }
      pulseInstanced.count = pCount;
      if (pCount > 0) {
        pulseInstanced.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    function desktopTick() {
      if (unmounted || renderer.xr.isPresenting) return;
      stepScene();
      if (isSoftwareGl) {
        afterDraw(desktopTick);
      } else {
        frameId = requestAnimationFrame(desktopTick);
      }
    }

    renderer.xr.addEventListener('sessionstart', () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.setAnimationLoop(stepScene);
    });

    renderer.xr.addEventListener('sessionend', () => {
      renderer.setAnimationLoop(null);
      desktopTick();
    });

    desktopTick();

    return () => {
      unmounted = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      disposeControllers();
      controls.dispose();
      padDisposeTextures.forEach((t) => t.dispose());
      gateCapTextures.forEach((t) => t.dispose());
      waferTex.dispose();
      envTexture.dispose();
      tileSocketGeo.dispose();
      tileSocketMat.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
      proxyGeo.dispose();
      proxyMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [canvasApiRef, domOverlayRef]);

  // Trigger non-destructive scene mesh sync whenever game state/cells/simulation change
  useEffect(() => {
    sceneSyncRef.current?.();
  }, [
    stage,
    placedCells,
    simulation,
    selectedPaletteGate,
    arPassthroughPreview,
  ]);

  return <div ref={mountRef} className="fixed inset-0 w-full h-full z-0" />;
}
