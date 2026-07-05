import * as THREE from 'three';
import { TABLE } from '../utils/constants';
import { createClothTexture, createWoodTexture } from '../assets/textures';

/**
 * Tournament-style table. Cloth surface sits at y=0; cushions and wood
 * frame rise above it, pockets are dark cylinders sunk into the corners.
 */
export class Table {
  readonly group = new THREE.Group();

  constructor() {
    const hw = TABLE.PLAY_W / 2;
    const hh = TABLE.PLAY_H / 2;
    const wood = createWoodTexture();

    const clothMat = new THREE.MeshStandardMaterial({
      map: createClothTexture(),
      roughness: 0.92,
      metalness: 0,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: wood,
      roughness: 0.35,
      metalness: 0.12,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: 0x1a6440,
      roughness: 0.9,
    });
    const pocketMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.6 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a35a, roughness: 0.3, metalness: 0.9 });

    // ---- Cloth bed ----
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE.PLAY_W + TABLE.CUSHION_W * 2, 0.04, TABLE.PLAY_H + TABLE.CUSHION_W * 2),
      clothMat,
    );
    bed.position.y = -0.02;
    bed.receiveShadow = true;
    this.group.add(bed);

    // ---- Cushions (with pocket gaps) ----
    const cushionH = TABLE.CUSHION_H;
    const cw = TABLE.CUSHION_W;
    const pc = TABLE.POCKET_R_CORNER + 0.02;
    const ps = TABLE.POCKET_R_SIDE + 0.02;

    const addCushion = (len: number, x: number, z: number, horizontal: boolean) => {
      const geo = horizontal
        ? new THREE.BoxGeometry(len, cushionH, cw)
        : new THREE.BoxGeometry(cw, cushionH, len);
      const m = new THREE.Mesh(geo, cushionMat);
      m.position.set(x, cushionH / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    };

    // Long rails: two segments each (gap at side pocket)
    const longSeg = (hw - pc - ps);
    for (const sz of [-1, 1]) {
      const zPos = sz * (hh + cw / 2);
      addCushion(longSeg, -(ps + longSeg / 2), zPos, true);
      addCushion(longSeg, ps + longSeg / 2, zPos, true);
    }
    // Short rails: one segment each
    const shortSeg = TABLE.PLAY_H - pc * 2;
    for (const sx of [-1, 1]) {
      addCushion(shortSeg, sx * (hw + cw / 2), 0, false);
    }

    // ---- Wood frame ----
    const fw = TABLE.FRAME_W;
    const fh = TABLE.FRAME_H;
    const outerW = TABLE.PLAY_W + cw * 2 + fw * 2;
    const outerH = TABLE.PLAY_H + cw * 2 + fw * 2;

    const frameLong = new THREE.BoxGeometry(outerW, fh, fw);
    const frameShort = new THREE.BoxGeometry(fw, fh, TABLE.PLAY_H + cw * 2);
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(frameLong, woodMat);
      m.position.set(0, cushionH - fh / 2 + 0.012, sz * (hh + cw + fw / 2));
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(frameShort, woodMat);
      m.position.set(sx * (hw + cw + fw / 2), cushionH - fh / 2 + 0.012, 0);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }

    // ---- Pockets ----
    const pocketGeo = new THREE.CylinderGeometry(TABLE.POCKET_R_CORNER * 1.15, TABLE.POCKET_R_CORNER * 0.9, 0.09, 20);
    const ringGeo = new THREE.TorusGeometry(TABLE.POCKET_R_CORNER * 1.08, 0.008, 8, 24);
    const cOff = 0.015;
    const pocketPositions = [
      [-hw - cOff, -hh - cOff], [hw + cOff, -hh - cOff],
      [-hw - cOff, hh + cOff], [hw + cOff, hh + cOff],
      [0, -hh - 0.022], [0, hh + 0.022],
    ];
    for (const [x, z] of pocketPositions) {
      const cup = new THREE.Mesh(pocketGeo, pocketMat);
      cup.position.set(x, -0.03, z);
      this.group.add(cup);
      const ring = new THREE.Mesh(ringGeo, brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, TABLE.CUSHION_H * 0.55, z);
      ring.castShadow = true;
      this.group.add(ring);
    }

    // ---- Spots & head string (cloth markings) ----
    const spotGeo = new THREE.CircleGeometry(0.008, 12);
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.5 });
    for (const x of [-hw / 2, hw / 2]) {
      const s = new THREE.Mesh(spotGeo, spotMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.0015, 0);
      this.group.add(s);
    }

    // ---- Apron + legs ----
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(outerW - 0.04, 0.12, outerH - 0.04),
      woodMat,
    );
    apron.position.y = -0.095;
    apron.castShadow = true;
    this.group.add(apron);

    const legGeo = new THREE.BoxGeometry(0.12, TABLE.LEG_H, 0.12);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, woodMat);
        leg.position.set(sx * (hw + cw), -TABLE.LEG_H / 2 - 0.14, sz * (hh + cw * 0.6));
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
  }
}
