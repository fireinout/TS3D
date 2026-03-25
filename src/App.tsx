import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, AlertCircle, Timer, Box, Maximize, Minimize } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants ---
const TRAY_SIZE = 7;
const ITEM_TYPES = [
  { id: 'cube', color: '#ef4444', geometry: new THREE.BoxGeometry(2.25, 2.25, 2.25) },
  { id: 'sphere', color: '#3b82f6', geometry: new THREE.SphereGeometry(1.5, 32, 32) },
  { id: 'cylinder', color: '#10b981', geometry: new THREE.CylinderGeometry(1.2, 1.2, 2.25, 32) },
  { id: 'torus', color: '#f59e0b', geometry: new THREE.TorusGeometry(1.05, 0.45, 16, 100) },
  { id: 'cone', color: '#8b5cf6', geometry: new THREE.ConeGeometry(1.5, 2.7, 32) },
  { id: 'octahedron', color: '#ec4899', geometry: new THREE.OctahedronGeometry(1.8) },
  { id: 'capsule', color: '#06b6d4', geometry: new THREE.CapsuleGeometry(1.05, 1.2, 4, 16) },
  { id: 'knot', color: '#14b8a6', geometry: new THREE.TorusKnotGeometry(0.9, 0.3, 64, 8) },
  { id: 'icosahedron', color: '#f97316', geometry: new THREE.IcosahedronGeometry(1.65) },
  { id: 'dodecahedron', color: '#a855f7', geometry: new THREE.DodecahedronGeometry(1.65) },
];

const LEVEL_CONFIGS = [
  { types: 8, triplesPerType: 8, time: 180 },
  { types: 10, triplesPerType: 12, time: 300 },
  { types: 10, triplesPerType: 16, time: 450 },
];

// --- Types ---
interface GameItem {
  id: string;
  typeId: string;
  mesh: THREE.Mesh;
  body?: CANNON.Body;
  targetPos?: THREE.Vector3;
  isMoving: boolean;
  isTransitioning?: boolean;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'won' | 'lost'>('start');
  const [level, setLevel] = useState(0);
  const [tray, setTray] = useState<GameItem[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [isMatching, setIsMatching] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);
  const [particleBursts, setParticleBursts] = useState<{ id: number; x: number; y: number }[]>([]);

  const trayRef = useRef<GameItem[]>([]);
  const uiTrayRef = useRef<HTMLDivElement>(null);
  const trayNDCRef = useRef<{ left: number; right: number; centerY: number }>({ left: -0.8, right: 0.8, centerY: -0.8 });
  const trayCapturedRef = useRef(false);
  const rotationRef = useRef(0);
  const clickedItemRef = useRef<GameItem | null>(null);

  // Sync rotationRef
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // Handle page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Sync trayRef with tray state
  useEffect(() => {
    trayRef.current = tray;
  }, [tray]);

  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const itemMaterialRef = useRef<CANNON.Material | null>(null);
  const itemsRef = useRef<GameItem[]>([]);
  const trayScaleRef = useRef(0.5);
  const requestRef = useRef<number>(0);

  // --- Game Logic ---

  const initScene = useCallback(() => {
    if (!containerRef.current) return () => {};

    // --- Physics Setup ---
    const world = new CANNON.World();
    world.gravity.set(0, -45, 0); // Further increased gravity for faster collapse
    world.allowSleep = true;
    worldRef.current = world;

    // Physics Materials
    const groundMaterial = new CANNON.Material('ground');
    const itemMaterial = new CANNON.Material('item');
    itemMaterialRef.current = itemMaterial;
    
    const groundItemContact = new CANNON.ContactMaterial(groundMaterial, itemMaterial, {
      friction: 0.5,
      restitution: 0.2,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    world.addContactMaterial(groundItemContact);

    const itemItemContact = new CANNON.ContactMaterial(itemMaterial, itemMaterial, {
      friction: 0.4,
      restitution: 0.1,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    world.addContactMaterial(itemItemContact);

    // Physics Floor
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    // Remove solid background to allow transparency
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    const updateCamera = () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.aspect = aspect;
      
      // Unified camera distance for both PC and mobile to ensure same stacking space feel
      if (aspect < 0.6) {
        // Very tall screens (iPhone 12/13/14)
        camera.position.set(0, 32, 38);
      } else {
        // Standard mobile and desktop
        camera.position.set(0, 28, 34);
      }
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    
    updateCamera();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Ensure canvas is layered correctly
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '10';
    renderer.domElement.style.pointerEvents = 'auto';

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // Floor - Only grid for better transparency
    const grid = new THREE.GridHelper(50, 50, 0x334155, 0x334155);
    grid.position.y = 0.01;
    scene.add(grid);

    // Glass Box Walls
    const wallMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      metalness: 0,
      roughness: 0,
      transmission: 0.9,
      thickness: 0.5,
    });

    const boxSize = 14.4; // 1.2x increase from 12
    const wallHeight = 120; // Massive walls to prevent any escape

    // Physics walls
    const wallShape = new CANNON.Box(new CANNON.Vec3(boxSize / 2, wallHeight / 2, 0.5));
    const sideWallShape = new CANNON.Box(new CANNON.Vec3(0.5, wallHeight / 2, boxSize / 2));

    const createWall = (pos: CANNON.Vec3, shape: CANNON.Shape, meshSize: [number, number, number]) => {
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(shape);
      body.position.copy(pos);
      world.addBody(body);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...meshSize), wallMaterial);
      mesh.position.set(pos.x, pos.y, pos.z);
      scene.add(mesh);
    };

    createWall(new CANNON.Vec3(0, wallHeight / 2, boxSize / 2), wallShape, [boxSize, wallHeight, 1]);
    createWall(new CANNON.Vec3(0, wallHeight / 2, -boxSize / 2), wallShape, [boxSize, wallHeight, 1]);
    createWall(new CANNON.Vec3(boxSize / 2, wallHeight / 2, 0), sideWallShape, [1, wallHeight, boxSize]);
    createWall(new CANNON.Vec3(-boxSize / 2, wallHeight / 2, 0), sideWallShape, [1, wallHeight, boxSize]);

    const trayPlane = new THREE.Plane();
    const cameraDir = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const intersectPoint = new THREE.Vector3();
    const mouseVector = new THREE.Vector2();

    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      
      // Step physics with more sub-steps for better collision accuracy and to reduce overlapping
      world.step(1 / 60, 1 / 60, 20);

      const camera = cameraRef.current;
      if (!camera) return;

      // Update camera based on rotation
      const radius = 35;
      const angle = rotationRef.current;
      camera.position.x = Math.sin(angle) * radius;
      camera.position.z = Math.cos(angle) * radius;
      camera.lookAt(0, 5, 0);

      // Handle item movement
      const currentItems = itemsRef.current || [];
      const currentTray = trayRef.current || [];
      
      // Update items in pile from physics
      currentItems.forEach(item => {
        if (item.body && !item.isMoving) {
          item.mesh.position.copy(item.body.position as unknown as THREE.Vector3);
          item.mesh.quaternion.copy(item.body.quaternion as unknown as THREE.Quaternion);
        }
      });

      // Update tray item positions dynamically to follow camera perfectly
      if (uiTrayRef.current) {
        // Retry capturing NDC if it's not yet captured or layout might have changed
        if (!trayCapturedRef.current) {
          if (updateTrayNDC()) {
            trayCapturedRef.current = true;
          }
        }

        const camera = cameraRef.current;
        if (!camera) return;
        
        camera.getWorldDirection(cameraDir);
        const planeNormal = cameraDir.clone().negate();
        
        // Slightly further distance for better perspective fit
        const trayDistance = 22; 
        const planePoint = camera.position.clone().add(cameraDir.clone().multiplyScalar(trayDistance));
        trayPlane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

        const { left, right, centerY } = trayNDCRef.current;
        
        const getWorldPos = (ndcX: number) => {
          mouseVector.set(ndcX, centerY);
          raycaster.setFromCamera(mouseVector, camera);
          const result = raycaster.ray.intersectPlane(trayPlane, intersectPoint);
          return result ? intersectPoint.clone() : new THREE.Vector3(0, -100, 0);
        };

        // Calculate slot positions more directly
        const getSlotPos = (index: number) => {
          const ndcX = left + (index + 0.5) * (right - left) / TRAY_SIZE;
          return getWorldPos(ndcX);
        };

        const leftWorld = getWorldPos(left);
        const rightWorld = getWorldPos(right);
        const trayWidth = new THREE.Vector3().subVectors(rightWorld, leftWorld).length();
        const slotWidth = trayWidth / TRAY_SIZE;

        // Scale items to fit comfortably in slots
        // Increased scale for better visibility
        const targetScale = (slotWidth * 0.85) / 2.25;
        trayScaleRef.current = Math.max(0.15, Math.min(0.6, targetScale));
        const currentTrayScale = trayScaleRef.current;

        currentTray.forEach((item, index) => {
          const targetPos = getSlotPos(index);
          
          item.targetPos = targetPos;
          item.mesh.quaternion.copy(camera.quaternion);

          // Always lerp position and scale for smooth movement, even when not "transitioning"
          // This handles index changes (grouping) smoothly
          const lerpFactor = item.isTransitioning ? 0.2 : 0.15;
          item.mesh.position.lerp(targetPos, lerpFactor);
          
          const s = item.mesh.scale.x;
          const nextS = THREE.MathUtils.lerp(s, currentTrayScale, 0.15);
          item.mesh.scale.set(nextS, nextS, nextS);

          if (item.isTransitioning) {
            if (item.mesh.position.distanceTo(targetPos) < 0.02) {
              item.isTransitioning = false;
              item.isMoving = false;
            }
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      updateCamera();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestRef.current);
      if (renderer.domElement && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  const clearAllItems = useCallback(() => {
    // Clear pile items
    itemsRef.current.forEach(item => {
      sceneRef.current?.remove(item.mesh);
      if (item.body) worldRef.current?.removeBody(item.body);
    });
    itemsRef.current = [];

    // Clear tray items
    trayRef.current.forEach(item => {
      sceneRef.current?.remove(item.mesh);
      if (item.body) worldRef.current?.removeBody(item.body);
    });
    setTray([]);
  }, []);

  const spawnItems = useCallback((typeCount: number, triplesPerType: number) => {
    if (!sceneRef.current || !worldRef.current) return;

    // Clear existing
    clearAllItems();

    const newItems: GameItem[] = [];
    const typesToUse = [...ITEM_TYPES].sort(() => Math.random() - 0.5).slice(0, typeCount);
    const totalCount = typeCount * triplesPerType * 3;

    for (let i = 0; i < totalCount; i++) {
      const type = typesToUse[i % typeCount];
      const material = new THREE.MeshStandardMaterial({ 
        color: type.color,
        roughness: 0.3,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(type.geometry, material);
      
      // Add outline to the mesh
      const threshold = (type.id === 'sphere' || type.id === 'cylinder' || type.id === 'cone' || type.id === 'torus' || type.id === 'knot') ? 60 : 20;
      const edges = new THREE.EdgesGeometry(type.geometry, threshold);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
      const outline = new THREE.LineSegments(edges, lineMaterial);
      outline.raycast = () => {}; // Make outline invisible to raycaster
      mesh.add(outline);
      
      // Physics Body
      let shape: CANNON.Shape;
      switch (type.id) {
        case 'cube':
          shape = new CANNON.Box(new CANNON.Vec3(1.125, 1.125, 1.125));
          break;
        case 'sphere':
          shape = new CANNON.Sphere(1.5);
          break;
        case 'cylinder':
          shape = new CANNON.Cylinder(1.2, 1.2, 2.25, 32);
          break;
        case 'cone':
          // Top radius 0.01, bottom 1.5, height 2.7
          shape = new CANNON.Cylinder(0.01, 1.5, 2.7, 32);
          break;
        case 'capsule':
          // Capsule is radius 1.05, height 1.2 (total height 3.3)
          shape = new CANNON.Cylinder(1.05, 1.05, 3.3, 16);
          break;
        case 'octahedron':
        case 'icosahedron':
        case 'dodecahedron':
          shape = new CANNON.Sphere(1.8);
          break;
        case 'torus':
        case 'knot':
          shape = new CANNON.Sphere(1.5);
          break;
        default:
          shape = new CANNON.Sphere(1.5);
      }

      const body = new CANNON.Body({
        mass: 1,
        material: itemMaterialRef.current || undefined,
        angularDamping: 0.15, // Reduced damping for more natural movement
        linearDamping: 0.1,
      });

      // Adjust orientation for cylinders/cones (Cannon is Z-aligned, Three is Y-aligned)
      if (type.id === 'cylinder' || type.id === 'capsule' || type.id === 'cone') {
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        body.addShape(shape, new CANNON.Vec3(), q);
      } else {
        body.addShape(shape);
      }

      // Random position in a pile - spread out more to avoid initial overlap
      const spread = 10; // Unified spread for both PC and mobile
      const startX = (Math.random() - 0.5) * spread;
      const startY = Math.random() * 30 + 15; // Higher stack
      const startZ = (Math.random() - 0.5) * spread;
      
      body.position.set(startX, startY, startZ);
      body.velocity.set(0, -15, 0); // Initial downward velocity to speed up the fall
      body.quaternion.setFromEuler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      mesh.position.set(startX, startY, startZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      sceneRef.current.add(mesh);
      worldRef.current.addBody(body);

      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        typeId: type.id,
        mesh,
        body,
        isMoving: false,
      });
    }
    itemsRef.current = newItems;
    console.log("Items spawned:", itemsRef.current.length);
  }, []);

  const startGame = () => {
    // Request fullscreen on mobile
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobileDevice && !document.fullscreenElement) {
      const docEl = document.documentElement as any;
      const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
      if (requestFs) {
        requestFs.call(docEl).catch(() => {});
      }
    }

    const config = LEVEL_CONFIGS[Math.min(level, LEVEL_CONFIGS.length - 1)];
    setGameState('playing');
    trayCapturedRef.current = false; // Reset capture flag for new game
    setTimeLeft(config.time);
    setScore(0);
    spawnItems(config.types, config.triplesPerType);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    // Prevent event from bubbling to platform UI
    if (event.nativeEvent) {
      event.nativeEvent.stopImmediatePropagation();
    }
    event.stopPropagation();
    
    if (gameState !== 'playing') return;
    
    setIsDragging(false);
    setLastMouseX(event.clientX);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, cameraRef.current!);
    const intersects = raycaster.intersectObjects(itemsRef.current.map(i => i.mesh), true);

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      const itemIndex = itemsRef.current.findIndex(i => {
        let curr: THREE.Object3D | null = clickedObject;
        while (curr) {
          if (curr === i.mesh) return true;
          curr = curr.parent;
        }
        return false;
      });
      const item = itemsRef.current[itemIndex];

      if (item && !item.isMoving) {
        clickedItemRef.current = item;
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (gameState !== 'playing') return;

    if (event.buttons === 1) {
      const deltaX = event.clientX - lastMouseX;
      if (Math.abs(deltaX) > 5) {
        setIsDragging(true);
      }
      setRotation(prev => prev - deltaX * 0.01);
      setLastMouseX(event.clientX);
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (gameState !== 'playing') return;
    
    const clickedItem = clickedItemRef.current;
    if (clickedItem && !isDragging) {
      const item = clickedItem;
      
      // Prevent clicking the same item twice or clicking when tray is full
      if (item.isMoving || trayRef.current.length >= TRAY_SIZE) return;

      // Mark as moving immediately to prevent double-clicks
      item.isMoving = true;
      item.isTransitioning = true;
      item.mesh.rotation.set(0, 0, 0);
      
      // Ensure tray items are always visible on top
      if (item.mesh.material) {
        const materials = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
        materials.forEach(m => {
          m.depthTest = false;
          m.transparent = true;
          m.depthWrite = false; // Further ensure no depth issues
        });
      }
      // Render order based on index will be updated in setTray
      item.mesh.renderOrder = 999;

      setTray(prevTray => {
        if (prevTray.length >= TRAY_SIZE) return prevTray;

        // Remove from physics world
        if (item.body && worldRef.current) {
          worldRef.current.removeBody(item.body);
          item.body = undefined;
        }

        // Calculate insertion index to group same types
        const sameTypeIndex = prevTray.findLastIndex(i => i.typeId === item.typeId);
        const insertIndex = sameTypeIndex !== -1 ? sameTypeIndex + 1 : prevTray.length;
        
        const newTray = [...prevTray];
        newTray.splice(insertIndex, 0, item);
        
        // Update render order to ensure correct overlapping in tray
        newTray.forEach((item, idx) => {
          item.mesh.renderOrder = 1000 + idx;
        });

        // Sync ref immediately
        trayRef.current = newTray;
        
        // Remove from main items list
        const itemIndex = itemsRef.current.indexOf(item);
        if (itemIndex !== -1) {
          itemsRef.current.splice(itemIndex, 1);
        }

        // Wake up neighbors
        itemsRef.current.forEach(i => {
          if (i.body) i.body.wakeUp();
        });

        return newTray;
      });
    }
    
    // Clear the stored item
    clickedItemRef.current = null;
    setIsDragging(false);
  };

  // Update tray NDC coordinates on resize
  const updateTrayNDC = useCallback(() => {
    if (!uiTrayRef.current) return false;
    const rect = uiTrayRef.current.getBoundingClientRect();
    
    // If rect is zero or very small, layout might not be ready
    if (rect.width <= 10) return false; 

    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Use the inner area (accounting for padding and border)
    // p-2 is 8px, border-4 is 4px -> total 12px
    const padding = 12;
    const innerLeft = rect.left + padding;
    const innerRight = rect.right - padding;
    
    trayNDCRef.current = {
      left: (innerLeft / width) * 2 - 1,
      right: (innerRight / width) * 2 - 1,
      centerY: -((rect.top + rect.height / 2) / height * 2 - 1)
    };
    
    return true;
  }, []);

  // Periodic check to ensure NDC is correct even if layout shifts
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
      updateTrayNDC();
    }, 1000);
    return () => clearInterval(interval);
  }, [updateTrayNDC, gameState]);

  useEffect(() => {
    const handleResize = () => {
      updateTrayNDC();
      trayCapturedRef.current = false; // Re-capture on next frame
    };
    
    updateTrayNDC();
    window.addEventListener('resize', handleResize);
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [updateTrayNDC, gameState]);

  // Check for matches in tray
  useEffect(() => {
    if (tray.length === 0) return;

    const typeCounts: Record<string, number> = {};
    tray.forEach(item => {
      typeCounts[item.typeId] = (typeCounts[item.typeId] || 0) + 1;
    });

    const matchedTypeId = Object.keys(typeCounts).find(typeId => typeCounts[typeId] >= 3);

    if (matchedTypeId) {
      setIsMatching(true);
      const timer = setTimeout(() => {
        const matchedItems = tray.filter(item => item.typeId === matchedTypeId).slice(0, 3);
        const remainingTray = tray.filter(item => !matchedItems.includes(item));
        
        // Remove matched from scene
        matchedItems.forEach(item => {
          sceneRef.current?.remove(item.mesh);
          if (item.body) worldRef.current?.removeBody(item.body);
        });
        
        setTray(remainingTray);
        setScore(s => s + 100);
        setIsMatching(false);

        // Add score particles
        const burstId = Date.now();
        setParticleBursts(prev => [...prev, { id: burstId, x: window.innerWidth / 2, y: window.innerHeight - 80 }]);
        setTimeout(() => {
          setParticleBursts(prev => prev.filter(b => b.id !== burstId));
        }, 2000);

        // Check win condition
        if (itemsRef.current.length === 0 && remainingTray.length === 0) {
          setGameState('won');
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }, 300);
      return () => clearTimeout(timer);
    } else if (tray.length >= TRAY_SIZE) {
      setGameState('lost');
    }
  }, [tray]);

  // Timer
  useEffect(() => {
    if (gameState !== 'playing' || timeLeft <= 0 || !isPageVisible) {
      if (timeLeft === 0 && gameState === 'playing') setGameState('lost');
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [gameState, timeLeft, isPageVisible]);

  // Orientation Check
  useEffect(() => {
    const checkOrientation = () => {
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
      setIsLandscape(isMobileDevice && window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Auto-scroll on mobile to hide address bar
  useEffect(() => {
    const hideAddressBar = () => {
      window.scrollTo(0, 1);
    };
    window.addEventListener('load', hideAddressBar);
    setTimeout(hideAddressBar, 1000);
    return () => window.removeEventListener('load', hideAddressBar);
  }, []);

  // Fullscreen handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const cleanup = initScene();
    return () => {
      if (cleanup) cleanup();
    };
  }, [initScene]);

  // --- UI Components ---

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0f172a] font-sans select-none touch-none">
      {/* Score Particles */}
      <AnimatePresence>
        {particleBursts.map(burst => (
          <div key={burst.id} className="absolute inset-0 pointer-events-none z-[60]">
            {Array.from({ length: 24 }).map((_, i) => {
              const size = 4 + Math.random() * 6;
              const color = ['#fbbf24', '#f59e0b', '#ffffff', '#fcd34d'][Math.floor(Math.random() * 4)];
              return (
                <motion.div
                  key={i}
                  initial={{ 
                    x: burst.x + (Math.random() - 0.5) * 60, 
                    y: burst.y + (Math.random() - 0.5) * 30,
                    scale: 0,
                    opacity: 1,
                    rotate: 0
                  }}
                  animate={{ 
                    x: [null, burst.x + (Math.random() - 0.5) * 300, 40], 
                    y: [null, burst.y - 150 - Math.random() * 150, 40],
                    scale: [0, 1.8, 1, 0.4],
                    opacity: [1, 1, 0.8, 0],
                    rotate: [0, 180, 360]
                  }}
                  transition={{ 
                    duration: 1.6, 
                    ease: "easeInOut",
                    delay: i * 0.03
                  }}
                  style={{ 
                    width: size, 
                    height: size, 
                    backgroundColor: color,
                    borderRadius: i % 3 === 0 ? '2px' : '50%' 
                  }}
                  className="absolute shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                />
              );
            })}
          </div>
        ))}
      </AnimatePresence>

      {/* 1. Tray UI Layer (Behind 3D Items) */}
      {gameState === 'playing' && (
        <div 
          ref={uiTrayRef}
          className={`absolute ${isMobile ? 'bottom-24' : 'bottom-4'} left-1/2 -translate-x-1/2 w-[90%] max-w-[500px] pointer-events-none z-[1]`}
        >
          <motion.div 
            animate={isMatching ? { x: [0, -5, 5, -5, 5, 0], scale: [1, 1.02, 1] } : {}}
            className="w-full h-20 bg-indigo-950/80 backdrop-blur-xl rounded-2xl border-4 border-indigo-500/40 flex items-center justify-between gap-1 p-2 relative shadow-2xl"
          >
            {/* Visual Slots */}
            {Array.from({ length: TRAY_SIZE }).map((_, i) => (
              <div key={i} className="flex-1 h-full rounded-lg border border-white/10 bg-black/40 shadow-inner" />
            ))}
          </motion.div>
        </div>
      )}

      {/* 2. 3D Canvas Container (Middle Layer) */}
      <div 
        ref={containerRef} 
        className="absolute inset-0 z-10 cursor-move"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* 3. HUD Layer (Top Layer) */}
      {gameState === 'playing' && (
        <div className={`absolute ${isMobile ? 'top-12' : 'top-0'} left-0 w-full p-2 flex justify-between items-start pointer-events-none z-30`}>
            <motion.div 
              animate={isMatching ? { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] } : {}}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/20 flex items-center gap-3"
            >
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span>{score}</span>
            </div>
            <div className={`flex items-center gap-2 font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
              <Timer className="w-5 h-5" />
              <span>{timeLeft}s</span>
            </div>
          </motion.div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={startGame}
              className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-xl shadow-lg border border-orange-400 pointer-events-auto transition-colors flex items-center gap-1"
              title="Restart Level"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[10px] font-bold">RESTART</span>
            </button>
            <div className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/20">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Level {level + 1}</span>
            </div>
            <button 
              onClick={toggleFullscreen}
              className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/20 pointer-events-auto hover:bg-white transition-colors"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4 text-slate-600" /> : <Maximize className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isLandscape && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center"
          >
            <RotateCcw className="w-16 h-16 mb-4 animate-spin-slow" />
            <h2 className="text-2xl font-bold mb-2">請旋轉裝置</h2>
            <p className="opacity-70">為了獲得最佳遊戲體驗，請使用縱向模式遊玩。</p>
          </motion.div>
        )}

        {gameState === 'start' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-lg p-3 text-center"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full border border-slate-100"
            >
              <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Box className="w-10 h-10 text-indigo-600" />
              </div>
              <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Triple Stack</h1>
              <p className="text-slate-500 mb-8 leading-relaxed">Match 3 identical items to clear the board. Don't let your tray fill up!</p>
              
              <button 
                onClick={startGame}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-lg"
              >
                <Play className="w-6 h-6 fill-current" />
                Play Now
              </button>
            </motion.div>
          </motion.div>
        )}

        {(gameState === 'won' || gameState === 'lost') && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-xl p-3 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full"
            >
              {gameState === 'won' ? (
                <>
                  <div className="w-20 h-20 bg-yellow-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Trophy className="w-10 h-10 text-yellow-600" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 mb-2">Level Complete!</h2>
                  <p className="text-slate-500 mb-8">You've cleared all items with {timeLeft}s left!</p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { setLevel(l => l + 1); startGame(); }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95"
                    >
                      Next Level
                    </button>
                    <button 
                      onClick={startGame}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl transition-all active:scale-95"
                    >
                      Replay
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-10 h-10 text-red-600" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 mb-2">Game Over</h2>
                  <p className="text-slate-500 mb-8">
                    {timeLeft === 0 ? "Time's up!" : "Your tray is full!"}
                  </p>
                  <button 
                    onClick={startGame}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Try Again
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        canvas {
          touch-action: none;
          outline: none;
        }
      `}</style>
    </div>
  );
}
