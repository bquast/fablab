import * as THREE from 'three';

export interface XRCapabilities {
  vrSupported: boolean;
  arSupported: boolean;
  activeSessionMode: 'none' | 'immersive-vr' | 'immersive-ar';
}

export interface XRControllerCallbacks {
  onRayStart: (ray: THREE.Ray) => void;
  onRayMove: (ray: THREE.Ray) => void;
  onRayEnd: (ray: THREE.Ray) => void;
}

const _tempMatrix = new THREE.Matrix4();
const _xrRay = new THREE.Ray();

export async function probeXRCapabilities(): Promise<{
  vrSupported: boolean;
  arSupported: boolean;
}> {
  if (typeof navigator === 'undefined' || !('xr' in navigator) || !navigator.xr) {
    return { vrSupported: false, arSupported: false };
  }
  try {
    const [vrSupported, arSupported] = await Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
    ]);
    return { vrSupported, arSupported };
  } catch {
    return { vrSupported: false, arSupported: false };
  }
}

export function attachXRControllers(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  callbacksRef: { current: XRControllerCallbacks },
): { updateControllers: () => void; disposeControllers: () => void } {
  const controllers: THREE.XRTargetRaySpace[] = [];
  let activeControllerIndex: number | null = null;

  const wandBodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.7,
  });
  const wandTipMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.8,
  });
  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -6),
  ]);
  const laserMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
  });

  const buildControllerRay = (ctrl: THREE.XRTargetRaySpace): THREE.Ray => {
    _tempMatrix.identity().extractRotation(ctrl.matrixWorld);
    _xrRay.origin.setFromMatrixPosition(ctrl.matrixWorld);
    _xrRay.direction.set(0, 0, -1).applyMatrix4(_tempMatrix).normalize();
    return _xrRay;
  };

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);

    // Multi-part cleanroom laser stylus
    const wandGroup = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.018, 0.14, 12),
      wandBodyMat,
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.05;

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.018, 12),
      wandTipMat,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.z = -0.015;

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.025, 12), wandTipMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.032;

    const laserLine = new THREE.Line(laserGeo, laserMat);
    wandGroup.add(handle, collar, tip, laserLine);
    wandGroup.visible = false;
    controller.add(wandGroup);

    controller.addEventListener('connected', () => {
      wandGroup.visible = true;
    });
    controller.addEventListener('disconnected', () => {
      wandGroup.visible = false;
    });

    controller.addEventListener('selectstart', () => {
      activeControllerIndex = i;
      callbacksRef.current.onRayStart(buildControllerRay(controller));
    });

    controller.addEventListener('selectend', () => {
      if (activeControllerIndex === i) {
        callbacksRef.current.onRayEnd(buildControllerRay(controller));
        activeControllerIndex = null;
      }
    });

    scene.add(controller);
    controllers.push(controller);
  }

  const updateControllers = () => {
    if (!renderer.xr.isPresenting || activeControllerIndex === null) return;
    const ctrl = controllers[activeControllerIndex];
    if (ctrl) {
      callbacksRef.current.onRayMove(buildControllerRay(ctrl));
    }
  };

  const disposeControllers = () => {
    controllers.forEach((c) => scene.remove(c));
    laserGeo.dispose();
    laserMat.dispose();
    wandBodyMat.dispose();
    wandTipMat.dispose();
  };

  return { updateControllers, disposeControllers };
}

export async function launchXRSession(
  mode: 'immersive-vr' | 'immersive-ar',
  renderer: THREE.WebGLRenderer,
  domOverlayRoot: HTMLElement | null,
  onSessionStateChange: (activeMode: 'none' | 'immersive-vr' | 'immersive-ar') => void,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return {
      ok: false,
      error:
        'WebXR API is not available in this browser. Open on Meta Quest Browser, Apple Vision Pro Safari, or Desktop Chrome with a WebXR headset or emulator.',
    };
  }

  const currentSession = renderer.xr.getSession();
  if (currentSession) {
    await currentSession.end();
    return { ok: true };
  }

  try {
    const optionalFeatures: string[] = ['local-floor', 'bounded-floor', 'hand-tracking'];
    const sessionInit: XRSessionInit & { domOverlay?: { root: HTMLElement } } = {
      optionalFeatures,
    };

    if (mode === 'immersive-ar') {
      optionalFeatures.push('hit-test');
      if (domOverlayRoot) {
        optionalFeatures.push('dom-overlay');
        sessionInit.domOverlay = { root: domOverlayRoot };
      }
    }

    const session = await navigator.xr.requestSession(mode, sessionInit);
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    onSessionStateChange(mode);

    session.addEventListener('end', () => {
      onSessionStateChange('none');
    });

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Unable to start ${mode === 'immersive-ar' ? 'AR' : 'VR'} session: ${msg}`,
    };
  }
}
