import * as THREE from 'three';
import { DIE_COLS, DIE_ROWS, GATE_SPECS } from '../game/stages';
import { GateType, PadDef, WireSegment } from '../game/types';

export const CELL_PITCH = 1.15;
export const DIE_ORIGIN_X = -((DIE_COLS - 1) * CELL_PITCH) / 2;
export const DIE_ORIGIN_Z = -((DIE_ROWS - 1) * CELL_PITCH) / 2 - 0.95;
export const DIE_SURFACE_Y = 0.22;
export const TRAY_Z = DIE_ORIGIN_Z + DIE_ROWS * CELL_PITCH + 0.88;

export function gridToWorld(col: number, row: number): { x: number; z: number } {
  return {
    x: DIE_ORIGIN_X + col * CELL_PITCH,
    z: DIE_ORIGIN_Z + row * CELL_PITCH,
  };
}

export function worldToGrid(x: number, z: number): { col: number; row: number } {
  const col = Math.round((x - DIE_ORIGIN_X) / CELL_PITCH);
  const row = Math.round((z - DIE_ORIGIN_Z) / CELL_PITCH);
  return { col, row };
}

export function createGateCapTexture(
  type: GateType,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const spec = GATE_SPECS[type];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Brushed dark silicon cap background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle horizontal brushed micro-lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let y = 8; y < 256; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Outer technical registration frame
  ctx.strokeStyle = spec.accentHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, 224, 224);

  // Pin-1 orientation notch in top-left corner
  ctx.fillStyle = spec.accentHex;
  ctx.beginPath();
  ctx.arc(38, 38, 9, 0, Math.PI * 2);
  ctx.fill();

  // Schematic gate symbol in upper-middle region
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cy = 104;
  if (type === 'NOT' || type === 'BUF') {
    ctx.beginPath();
    ctx.moveTo(64, cy);
    ctx.lineTo(94, cy);
    ctx.moveTo(94, cy - 30);
    ctx.lineTo(154, cy);
    ctx.lineTo(94, cy + 30);
    ctx.closePath();
    ctx.stroke();
    if (type === 'NOT') {
      ctx.beginPath();
      ctx.arc(166, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(176, cy);
      ctx.lineTo(196, cy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(154, cy);
      ctx.lineTo(196, cy);
      ctx.stroke();
    }
  } else if (type === 'AND2' || type === 'NAND2') {
    ctx.beginPath();
    ctx.moveTo(64, cy - 16);
    ctx.lineTo(92, cy - 16);
    ctx.moveTo(64, cy + 16);
    ctx.lineTo(92, cy + 16);
    ctx.moveTo(92, cy - 30);
    ctx.lineTo(124, cy - 30);
    ctx.arc(124, cy, 30, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(92, cy + 30);
    ctx.closePath();
    ctx.stroke();
    if (type === 'NAND2') {
      ctx.beginPath();
      ctx.arc(166, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(176, cy);
      ctx.lineTo(196, cy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(154, cy);
      ctx.lineTo(196, cy);
      ctx.stroke();
    }
  } else {
    // OR2 / XOR2 curved IEEE body
    ctx.beginPath();
    ctx.moveTo(60, cy - 16);
    ctx.lineTo(94, cy - 16);
    ctx.moveTo(60, cy + 16);
    ctx.lineTo(94, cy + 16);
    ctx.stroke();

    if (type === 'XOR2') {
      ctx.beginPath();
      ctx.quadraticCurveTo(96, cy, 80, cy + 30);
      ctx.moveTo(80, cy - 30);
      ctx.quadraticCurveTo(98, cy, 80, cy + 30);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(92, cy - 30);
    ctx.quadraticCurveTo(138, cy - 30, 162, cy);
    ctx.quadraticCurveTo(138, cy + 30, 92, cy + 30);
    ctx.quadraticCurveTo(110, cy, 92, cy - 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(162, cy);
    ctx.lineTo(196, cy);
    ctx.stroke();
  }

  // Crisp laser-etched label
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 40px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(spec.label, 128, 192);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.fillText(`${spec.intrinsicDelayPs}ps · ${spec.transistorCount}T`, 128, 224);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createWaferSurfaceTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#131c2e';
  ctx.fillRect(0, 0, 512, 512);

  // Photolithography reticle grid lines across the 300mm wafer
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

/**
 * Builds a composite 8-part procedural CMOS Standard Cell IC Group
 * pivoted at bottom-center (y = 0) so it rests flush on the die surface.
 */
export function createStandardCellMesh(
  type: GateType,
  capTexture: THREE.CanvasTexture,
  castShadow: boolean,
): { group: THREE.Group; statusLedMat: THREE.MeshStandardMaterial } {
  const spec = GATE_SPECS[type];
  const group = new THREE.Group();

  // 1. Soft radial contact shadow disc (offset +0.012 to prevent Z-fighting)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.54, 20), shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.012;
  group.add(shadowDisc);

  // 2. Primary Silhouette: Beveled Ceramic/Epoxy IC Package Body (matte roughness 0.74)
  const pkgShape = createRoundedRectShape(0.84, 0.84, 0.09);
  const pkgGeo = new THREE.ExtrudeGeometry(pkgShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  pkgGeo.rotateX(-Math.PI / 2);
  const pkgMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.74,
    metalness: 0.14,
  });
  const pkgMesh = new THREE.Mesh(pkgGeo, pkgMat);
  pkgMesh.position.y = 0.035;
  pkgMesh.castShadow = castShadow;
  pkgMesh.receiveShadow = true;
  group.add(pkgMesh);

  // 3. Secondary Read: Anodized Accent Frame Collar (roughness 0.36, metalness 0.65)
  const collarGeo = new THREE.BoxGeometry(0.88, 0.045, 0.88);
  const collarMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.accentHex),
    roughness: 0.36,
    metalness: 0.65,
  });
  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.position.y = 0.21;
  group.add(collarMesh);

  // 4. Secondary Read: Brushed Metallic Heat-Spreader Lid with Laser-Etched Cap Texture (roughness 0.22)
  const lidGeo = new THREE.BoxGeometry(0.74, 0.04, 0.74);
  const lidSideMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.24,
    metalness: 0.86,
  });
  const lidTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: capTexture,
    roughness: 0.26,
    metalness: 0.35,
  });
  const lidMesh = new THREE.Mesh(lidGeo, [
    lidSideMat,
    lidSideMat,
    lidTopMat,
    lidSideMat,
    lidSideMat,
    lidSideMat,
  ]);
  lidMesh.position.y = 0.285;
  lidMesh.castShadow = castShadow;
  group.add(lidMesh);

  // 5-7. Accent Details: Gold Gull-Wing Input (West) & Output (East) Leads
  const pinMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.22,
    metalness: 0.92,
  });
  const pinGeo = new THREE.BoxGeometry(0.14, 0.05, 0.09);

  if (spec.inputs === 1) {
    const inPin = new THREE.Mesh(pinGeo, pinMat);
    inPin.position.set(-0.46, 0.06, 0);
    group.add(inPin);
  } else {
    const inPin1 = new THREE.Mesh(pinGeo, pinMat);
    inPin1.position.set(-0.46, 0.06, -0.2);
    const inPin2 = new THREE.Mesh(pinGeo, pinMat);
    inPin2.position.set(-0.46, 0.06, 0.2);
    group.add(inPin1, inPin2);
  }

  const outPin = new THREE.Mesh(pinGeo, pinMat);
  outPin.position.set(0.46, 0.06, 0);
  group.add(outPin);

  // 8. Logic Output Optical Probe Lens on East edge
  const statusLedMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.2,
    metalness: 0.2,
  });
  const ledMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12),
    statusLedMat,
  );
  ledMesh.position.set(0.32, 0.31, 0.28);
  group.add(ledMesh);

  return { group, statusLedMat };
}

export function createPadLabelTexture(
  label: string,
  side: 'west' | 'east',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = side === 'west' ? '#0c2438' : '#2b1c08';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = side === 'west' ? '#38bdf8' : '#f59e0b';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 112);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 42px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 66);

  ctx.fillStyle = side === 'west' ? '#7dd3fc' : '#fcd34d';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(side === 'west' ? 'INPUT PAD →' : '→ OUTPUT PAD', 128, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBondPadMesh(
  pad: PadDef,
  maxAnisotropy: number,
): { group: THREE.Group; signalMat: THREE.MeshStandardMaterial; tex: THREE.CanvasTexture } {
  const group = new THREE.Group();
  const { x, z } = gridToWorld(pad.col, pad.row);
  group.position.set(x, DIE_SURFACE_Y, z);

  // Ceramic carrier pedestal
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.14, 0.78),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.68,
      metalness: 0.25,
    }),
  );
  base.position.y = 0.07;
  group.add(base);

  // Brushed gold wire-bond pad
  const goldPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.04, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.2,
      metalness: 0.95,
    }),
  );
  goldPad.position.set(pad.side === 'west' ? 0.26 : -0.26, 0.16, 0);
  group.add(goldPad);

  // Signal indicator bar
  const signalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.25,
    metalness: 0.3,
  });
  const sigBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 14), signalMat);
  sigBar.position.set(pad.side === 'west' ? 0.26 : -0.26, 0.21, 0.24);
  group.add(sigBar);

  // Tilted silk-screen plaque
  const tex = createPadLabelTexture(pad.label, pad.side, maxAnisotropy);
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.03, 0.4),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.35,
      metalness: 0.15,
    }),
  );
  plaque.position.set(pad.side === 'west' ? -0.14 : 0.14, 0.19, -0.05);
  plaque.rotation.z = pad.side === 'west' ? -0.12 : 0.12;
  group.add(plaque);

  return { group, signalMat, tex };
}

export interface BuiltWireRoute {
  group: THREE.Group;
  pathPoints: THREE.Vector3[];
  signal: 0 | 1;
}

/**
 * Builds orthogonal 3D Metal-1 (copper) and Metal-2 (cyan-aluminum + vertical Via studs)
 * Manhattan traces on the silicon die surface.
 */
export function buildManhattanWireGroup(wires: WireSegment[]): {
  group: THREE.Group;
  routes: Array<{ start: THREE.Vector3; corner: THREE.Vector3; end: THREE.Vector3; signal: 0 | 1 }>;
} {
  const group = new THREE.Group();
  const routes: Array<{
    start: THREE.Vector3;
    corner: THREE.Vector3;
    end: THREE.Vector3;
    signal: 0 | 1;
  }> = [];

  const m1ActiveMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.85,
  });
  const m1IdleMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.45,
    metalness: 0.78,
  });
  const m2ActiveMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.85,
  });
  const m2IdleMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.45,
    metalness: 0.75,
  });
  const viaMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.22,
    metalness: 0.92,
  });

  wires.forEach((w, idx) => {
    const p1 = gridToWorld(w.fromCol, w.fromRow);
    const p2 = gridToWorld(w.toCol, w.toRow);

    const laneOffset = ((idx % 3) - 1) * 0.07;
    const yLayer = w.layer === 'M1' ? DIE_SURFACE_Y + 0.055 : DIE_SURFACE_Y + 0.125;

    const startX = p1.x + 0.34;
    const startZ = p1.z + laneOffset;
    const endX = p2.x - 0.34;
    const endZ = p2.z + (w.layer === 'M2' ? 0.14 : -0.06);
    const midX = (startX + endX) * 0.5 + laneOffset;

    const mat =
      w.layer === 'M1'
        ? w.signal === 1
          ? m1ActiveMat
          : m1IdleMat
        : w.signal === 1
          ? m2ActiveMat
          : m2IdleMat;

    const thickness = 0.048;

    // Horizontal segment 1: startX -> midX at startZ
    const seg1Len = Math.abs(midX - startX);
    if (seg1Len > 0.02) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(seg1Len + thickness, thickness, thickness),
        mat,
      );
      m.position.set((startX + midX) / 2, yLayer, startZ);
      group.add(m);
    }

    // Vertical (Z) jog segment: startZ -> endZ at midX
    const seg2Len = Math.abs(endZ - startZ);
    if (seg2Len > 0.02) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, thickness, seg2Len + thickness),
        mat,
      );
      m.position.set(midX, yLayer, (startZ + endZ) / 2);
      group.add(m);

      // Add Tungsten Via pillar at layer corners
      const via = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, yLayer - DIE_SURFACE_Y + 0.02, 8),
        viaMat,
      );
      via.position.set(midX, (DIE_SURFACE_Y + yLayer) / 2, startZ);
      group.add(via);
    }

    // Horizontal segment 2: midX -> endX at endZ
    const seg3Len = Math.abs(endX - midX);
    if (seg3Len > 0.02) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(seg3Len + thickness, thickness, thickness),
        mat,
      );
      m.position.set((midX + endX) / 2, yLayer, endZ);
      group.add(m);
    }

    routes.push({
      start: new THREE.Vector3(startX, yLayer + 0.025, startZ),
      corner: new THREE.Vector3(midX, yLayer + 0.025, (startZ + endZ) / 2),
      end: new THREE.Vector3(endX, yLayer + 0.025, endZ),
      signal: w.signal,
    });
  });

  return { group, routes };
}
