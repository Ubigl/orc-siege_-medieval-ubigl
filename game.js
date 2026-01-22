import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;
const RENDER_DISTANCE = 4;
const BLOCK_TYPES = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5
};

const BLOCK_NAMES = {
    [BLOCK_TYPES.DIRT]: 'Dirt',
    [BLOCK_TYPES.GRASS]: 'Grass',
    [BLOCK_TYPES.STONE]: 'Stone',
    [BLOCK_TYPES.WOOD]: 'Wood',
    [BLOCK_TYPES.LEAVES]: 'Leaves'
};

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.chunks = new Map();
        this.textures = {};
        this.materials = {};
        this.blockGeometry = null;
        this.selectionBox = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedBlock = null;
        this.selectedSlot = 0;
        this.breakSound = null;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isRunning = false;
        this.noise2D = createNoise2D();
        this.prevTime = performance.now();
        this.playerHeight = 1.8;
        this.playerWidth = 0.3;
        this.gravity = 30;
        this.jumpVelocity = 10;
        this.walkSpeed = 5;
        this.runSpeed = 8;
        this.worldData = new Map();
        
        this.inventory = {
            [BLOCK_TYPES.DIRT]: 0,
            [BLOCK_TYPES.GRASS]: 0,
            [BLOCK_TYPES.STONE]: 0,
            [BLOCK_TYPES.WOOD]: 0,
            [BLOCK_TYPES.LEAVES]: 0
        };
        
        this.slotToBlockType = [
            BLOCK_TYPES.DIRT,
            BLOCK_TYPES.GRASS,
            BLOCK_TYPES.STONE,
            BLOCK_TYPES.WOOD,
            BLOCK_TYPES.LEAVES
        ];
        
        this.init();
    }

    init() {
        this.setupRenderer();
        this.setupCamera();
        this.setupControls();
        this.loadAssets();
        this.setupLighting();
        this.createSelectionBox();
        this.setupEventListeners();
        this.generateInitialChunks();
        this.updateInventoryUI();
        this.animate();
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x87CEEB);
        document.body.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, RENDER_DISTANCE * CHUNK_SIZE);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);
    }

    setupControls() {
        this.controls = new PointerLockControls(this.camera, document.body);
        
        const blocker = document.getElementById('blocker');
        
        blocker.addEventListener('click', () => {
            document.body.requestPointerLock = document.body.requestPointerLock || document.body.mozRequestPointerLock;
            document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                blocker.classList.add('hidden');
                this.controls.isLocked = true;
            } else {
                blocker.classList.remove('hidden');
                this.controls.isLocked = false;
            }
        });

        this.scene.add(this.controls.getObject());
    }

    loadAssets() {
        const loader = new THREE.TextureLoader();
        
        const loadTexture = (path) => {
            const texture = loader.load(path);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        };

        this.textures = {
            dirt: loadTexture('Assets/Dirt.png'),
            grass: loadTexture('Assets/grass.png'),
            stone: loadTexture('Assets/stone.png'),
            wood: loadTexture('Assets/tree.png'),
            leaves: loadTexture('Assets/foliage.png')
        };

        this.materials = {
            [BLOCK_TYPES.DIRT]: new THREE.MeshLambertMaterial({ map: this.textures.dirt }),
            [BLOCK_TYPES.GRASS]: new THREE.MeshLambertMaterial({ map: this.textures.grass }),
            [BLOCK_TYPES.STONE]: new THREE.MeshLambertMaterial({ map: this.textures.stone }),
            [BLOCK_TYPES.WOOD]: new THREE.MeshLambertMaterial({ map: this.textures.wood }),
            [BLOCK_TYPES.LEAVES]: new THREE.MeshLambertMaterial({ map: this.textures.leaves, transparent: true, opacity: 0.9 })
        };

        this.blockGeometry = new THREE.BoxGeometry(1, 1, 1);

        this.breakSound = new Audio('Assets/sound of a block breaking.mp3');
        this.breakSound.volume = 0.5;
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 50);
        this.scene.add(directionalLight);
    }

    createSelectionBox() {
        const geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        this.selectionBox = new THREE.LineSegments(edges, material);
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('wheel', (e) => this.onMouseWheel(e));
        
        document.querySelectorAll('.hotbar-slot').forEach(slot => {
            slot.addEventListener('click', (e) => {
                const slotIndex = parseInt(slot.dataset.slot);
                this.selectSlot(slotIndex);
            });
        });
    }

    selectSlot(index) {
        this.selectedSlot = index;
        document.querySelectorAll('.hotbar-slot').forEach(s => s.classList.remove('selected'));
        document.querySelector(`.hotbar-slot[data-slot="${index}"]`).classList.add('selected');
    }

    getSelectedBlockType() {
        return this.slotToBlockType[this.selectedSlot];
    }

    getSelectedBlockCount() {
        return this.inventory[this.getSelectedBlockType()];
    }

    addToInventory(blockType, count = 1) {
        this.inventory[blockType] += count;
        this.updateInventoryUI();
    }

    removeFromInventory(blockType, count = 1) {
        if (this.inventory[blockType] >= count) {
            this.inventory[blockType] -= count;
            this.updateInventoryUI();
            return true;
        }
        return false;
    }

    updateInventoryUI() {
        document.querySelectorAll('.hotbar-slot').forEach((slot, index) => {
            const blockType = this.slotToBlockType[index];
            const count = this.inventory[blockType];
            const countEl = slot.querySelector('.slot-count');
            countEl.textContent = count > 0 ? count : '';
            
            if (count === 0) {
                slot.classList.add('empty');
            } else {
                slot.classList.remove('empty');
            }
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseWheel(event) {
        if (!this.controls.isLocked) return;
        
        if (event.deltaY > 0) {
            this.selectedSlot = (this.selectedSlot + 1) % 5;
        } else {
            this.selectedSlot = (this.selectedSlot - 1 + 5) % 5;
        }
        this.selectSlot(this.selectedSlot);
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'Space': 
                if (this.canJump) {
                    this.velocity.y = this.jumpVelocity;
                    this.canJump = false;
                }
                break;
            case 'ShiftLeft': this.isRunning = true; break;
            case 'Digit1': this.selectSlot(0); break;
            case 'Digit2': this.selectSlot(1); break;
            case 'Digit3': this.selectSlot(2); break;
            case 'Digit4': this.selectSlot(3); break;
            case 'Digit5': this.selectSlot(4); break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'ShiftLeft': this.isRunning = false; break;
        }
    }

    onMouseDown(event) {
        if (!this.controls.isLocked) return;

        if (event.button === 0) {
            this.breakBlock();
        } else if (event.button === 2) {
            this.placeBlock();
        }
    }

    getBlockKey(x, y, z) {
        return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    }

    getBlock(x, y, z) {
        const key = this.getBlockKey(x, y, z);
        return this.worldData.get(key) || BLOCK_TYPES.AIR;
    }

    setBlock(x, y, z, type) {
        const key = this.getBlockKey(Math.floor(x), Math.floor(y), Math.floor(z));
        if (type === BLOCK_TYPES.AIR) {
            this.worldData.delete(key);
        } else {
            this.worldData.set(key, type);
        }
    }

    breakBlock() {
        if (!this.selectedBlock) return;

        const pos = this.selectedBlock.position;
        const blockType = this.selectedBlock.type;
        
        this.setBlock(pos.x, pos.y, pos.z, BLOCK_TYPES.AIR);
        
        this.addToInventory(blockType, 1);
        
        const chunkX = Math.floor(pos.x / CHUNK_SIZE);
        const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
        this.rebuildChunk(chunkX, chunkZ);

        this.breakSound.currentTime = 0;
        this.breakSound.play().catch(() => {});
    }

    placeBlock() {
        if (!this.selectedBlock) return;
        
        const blockType = this.getSelectedBlockType();
        if (this.getSelectedBlockCount() <= 0) return;

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.getChunkMeshes(), true);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const normal = intersect.face.normal;
            const pos = this.selectedBlock.position.clone();
            pos.add(normal);

            const playerPos = this.camera.position.clone();
            const blockMin = pos.clone().subScalar(0.5);
            const blockMax = pos.clone().addScalar(0.5);
            const playerMin = new THREE.Vector3(playerPos.x - this.playerWidth, playerPos.y - this.playerHeight, playerPos.z - this.playerWidth);
            const playerMax = new THREE.Vector3(playerPos.x + this.playerWidth, playerPos.y + 0.2, playerPos.z + this.playerWidth);

            if (this.boxesIntersect(blockMin, blockMax, playerMin, playerMax)) {
                return;
            }

            if (this.removeFromInventory(blockType, 1)) {
                this.setBlock(pos.x, pos.y, pos.z, blockType);
                
                const chunkX = Math.floor(pos.x / CHUNK_SIZE);
                const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
                this.rebuildChunk(chunkX, chunkZ);
            }
        }
    }

    boxesIntersect(min1, max1, min2, max2) {
        return (min1.x <= max2.x && max1.x >= min2.x) &&
               (min1.y <= max2.y && max1.y >= min2.y) &&
               (min1.z <= max2.z && max1.z >= min2.z);
    }

    getChunkMeshes() {
        const meshes = [];
        this.chunks.forEach(chunk => {
            chunk.meshes.forEach(mesh => meshes.push(mesh));
        });
        return meshes;
    }

    generateHeight(x, z) {
        const scale1 = 0.015;
        const scale2 = 0.04;
        
        let height = 0;
        height += this.noise2D(x * scale1, z * scale1) * 4;
        height += this.noise2D(x * scale2, z * scale2) * 2;
        
        return Math.floor(height + 10);
    }

    shouldPlaceTree(x, z) {
        const treeNoise = this.noise2D(x * 0.3 + 100, z * 0.3 + 100);
        const spacing = this.noise2D(x * 0.1, z * 0.1);
        return treeNoise > 0.6 && spacing > 0.3 && (x % 7 === 0) && (z % 7 === 0);
    }

    generateChunkData(chunkX, chunkZ) {
        const startX = chunkX * CHUNK_SIZE;
        const startZ = chunkZ * CHUNK_SIZE;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const worldX = startX + x;
                const worldZ = startZ + z;
                const height = this.generateHeight(worldX, worldZ);

                for (let y = 0; y <= height; y++) {
                    let blockType;
                    if (y === height) {
                        blockType = BLOCK_TYPES.GRASS;
                    } else if (y > height - 3) {
                        blockType = BLOCK_TYPES.DIRT;
                    } else {
                        blockType = BLOCK_TYPES.STONE;
                    }
                    this.setBlock(worldX, y, worldZ, blockType);
                }

                if (this.shouldPlaceTree(worldX, worldZ) && height > 5) {
                    this.generateTree(worldX, height + 1, worldZ);
                }
            }
        }
    }

    generateTree(x, y, z) {
        const trunkHeight = 4 + Math.floor(this.noise2D(x * 10, z * 10) * 2 + 1);
        
        for (let i = 0; i < trunkHeight; i++) {
            this.setBlock(x, y + i, z, BLOCK_TYPES.WOOD);
        }

        const leafStart = y + trunkHeight - 2;
        for (let ly = leafStart; ly < y + trunkHeight + 2; ly++) {
            const radius = ly < y + trunkHeight ? 2 : 1;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (Math.abs(lx) === radius && Math.abs(lz) === radius) continue;
                    if (lx === 0 && lz === 0 && ly < y + trunkHeight) continue;
                    this.setBlock(x + lx, ly, z + lz, BLOCK_TYPES.LEAVES);
                }
            }
        }
    }

    buildChunkMesh(chunkX, chunkZ) {
        const startX = chunkX * CHUNK_SIZE;
        const startZ = chunkZ * CHUNK_SIZE;
        
        const blocksByType = {};
        
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const worldX = startX + x;
                    const worldZ = startZ + z;
                    const blockType = this.getBlock(worldX, y, worldZ);
                    
                    if (blockType === BLOCK_TYPES.AIR) continue;
                    
                    const hasExposedFace = 
                        this.getBlock(worldX + 1, y, worldZ) === BLOCK_TYPES.AIR ||
                        this.getBlock(worldX - 1, y, worldZ) === BLOCK_TYPES.AIR ||
                        this.getBlock(worldX, y + 1, worldZ) === BLOCK_TYPES.AIR ||
                        this.getBlock(worldX, y - 1, worldZ) === BLOCK_TYPES.AIR ||
                        this.getBlock(worldX, y, worldZ + 1) === BLOCK_TYPES.AIR ||
                        this.getBlock(worldX, y, worldZ - 1) === BLOCK_TYPES.AIR;
                    
                    if (!hasExposedFace) continue;
                    
                    if (!blocksByType[blockType]) {
                        blocksByType[blockType] = [];
                    }
                    blocksByType[blockType].push({ x: worldX, y, z: worldZ });
                }
            }
        }
        
        const meshes = [];
        
        for (const [type, blocks] of Object.entries(blocksByType)) {
            if (blocks.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                this.blockGeometry,
                this.materials[type],
                blocks.length
            );
            
            const matrix = new THREE.Matrix4();
            blocks.forEach((block, index) => {
                matrix.setPosition(block.x + 0.5, block.y + 0.5, block.z + 0.5);
                instancedMesh.setMatrixAt(index, matrix);
            });
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.userData.chunkX = chunkX;
            instancedMesh.userData.chunkZ = chunkZ;
            instancedMesh.userData.blocks = blocks;
            instancedMesh.userData.blockType = parseInt(type);
            
            meshes.push(instancedMesh);
        }
        
        return meshes;
    }

    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) return;

        this.generateChunkData(chunkX, chunkZ);
        const meshes = this.buildChunkMesh(chunkX, chunkZ);
        
        meshes.forEach(mesh => this.scene.add(mesh));
        this.chunks.set(key, { meshes, chunkX, chunkZ });
    }

    rebuildChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        
        if (chunk) {
            chunk.meshes.forEach(mesh => {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
            });
        }

        const meshes = this.buildChunkMesh(chunkX, chunkZ);
        meshes.forEach(mesh => this.scene.add(mesh));
        this.chunks.set(key, { meshes, chunkX, chunkZ });
    }

    removeChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        
        if (chunk) {
            chunk.meshes.forEach(mesh => {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
            });
            this.chunks.delete(key);
        }
    }

    generateInitialChunks() {
        const playerChunkX = Math.floor(this.camera.position.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(this.camera.position.z / CHUNK_SIZE);

        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                this.generateChunk(playerChunkX + x, playerChunkZ + z);
            }
        }
    }

    updateChunks() {
        const playerChunkX = Math.floor(this.camera.position.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(this.camera.position.z / CHUNK_SIZE);

        const neededChunks = new Set();
        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                neededChunks.add(`${chunkX},${chunkZ}`);
                this.generateChunk(chunkX, chunkZ);
            }
        }

        this.chunks.forEach((chunk, key) => {
            if (!neededChunks.has(key)) {
                this.removeChunk(chunk.chunkX, chunk.chunkZ);
            }
        });
    }

    updateSelection() {
        if (!this.controls.isLocked) {
            this.selectionBox.visible = false;
            return;
        }

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = 6;

        const intersects = this.raycaster.intersectObjects(this.getChunkMeshes(), true);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const instanceId = intersect.instanceId;
            const mesh = intersect.object;
            
            if (instanceId !== undefined && mesh.userData.blocks) {
                const block = mesh.userData.blocks[instanceId];
                if (block) {
                    this.selectionBox.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
                    this.selectionBox.visible = true;
                    this.selectedBlock = {
                        position: new THREE.Vector3(block.x, block.y, block.z),
                        type: mesh.userData.blockType
                    };
                    return;
                }
            }
        }

        this.selectionBox.visible = false;
        this.selectedBlock = null;
    }

    checkCollision(x, y, z) {
        const positions = [
            [x - this.playerWidth, y, z - this.playerWidth],
            [x + this.playerWidth, y, z - this.playerWidth],
            [x - this.playerWidth, y, z + this.playerWidth],
            [x + this.playerWidth, y, z + this.playerWidth],
            [x - this.playerWidth, y - this.playerHeight, z - this.playerWidth],
            [x + this.playerWidth, y - this.playerHeight, z - this.playerWidth],
            [x - this.playerWidth, y - this.playerHeight, z + this.playerWidth],
            [x + this.playerWidth, y - this.playerHeight, z + this.playerWidth],
        ];

        for (const pos of positions) {
            if (this.getBlock(Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2])) !== BLOCK_TYPES.AIR) {
                return true;
            }
        }
        return false;
    }

    updatePlayer(delta) {
        if (!this.controls.isLocked) return;

        this.velocity.y -= this.gravity * delta;

        const camera = this.camera;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        right.normalize();

        const speed = this.isRunning ? this.runSpeed : this.walkSpeed;

        let moveVec = new THREE.Vector3();
        if (this.moveForward) moveVec.addScaledVector(forward, speed);
        if (this.moveBackward) moveVec.addScaledVector(forward, -speed);
        if (this.moveRight) moveVec.addScaledVector(right, speed);
        if (this.moveLeft) moveVec.addScaledVector(right, -speed);

        const pos = camera.position.clone();
        
        const moveX = moveVec.x * delta;
        const moveZ = moveVec.z * delta;

        let newX = pos.x + moveX;
        let newZ = pos.z + moveZ;
        let newY = pos.y + this.velocity.y * delta;

        if (!this.checkCollision(newX, pos.y, pos.z)) {
            this.camera.position.x = newX;
        }

        if (!this.checkCollision(this.camera.position.x, pos.y, newZ)) {
            this.camera.position.z = newZ;
        }

        if (!this.checkCollision(this.camera.position.x, newY, this.camera.position.z)) {
            this.camera.position.y = newY;
        } else {
            if (this.velocity.y < 0) {
                this.canJump = true;
                const groundY = Math.floor(newY - this.playerHeight) + 1 + this.playerHeight;
                this.camera.position.y = groundY;
            }
            this.velocity.y = 0;
        }

        if (this.camera.position.y < -50) {
            this.camera.position.set(0, 20, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    updateDebug() {
        const pos = this.camera.position;
        const chunkX = Math.floor(pos.x / CHUNK_SIZE);
        const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
        const blockType = this.getSelectedBlockType();
        const blockCount = this.getSelectedBlockCount();
        
        document.getElementById('debug').innerHTML = `
            XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}<br>
            Chunk: ${chunkX}, ${chunkZ}<br>
            Chunks: ${this.chunks.size}<br>
            Block: ${BLOCK_NAMES[blockType]} (${blockCount})
        `;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = performance.now();
        const delta = Math.min((time - this.prevTime) / 1000, 0.1);
        this.prevTime = time;

        this.updatePlayer(delta);
        this.updateChunks();
        this.updateSelection();
        this.updateDebug();

        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
