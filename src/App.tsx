import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, AlertCircle, Timer, Box, Maximize, Minimize, Palette, Pause, Home } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants ---
const TRAY_SIZE = 8;

// Helper for standard physics rotation (Cylinders often need -90deg X rotation)
const ROT_X_NEG_90 = new CANNON.Quaternion();
ROT_X_NEG_90.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);

interface ThemeItem {
  id: string;
  name: string;
  color: string;
  texture?: string;
  createGeometry: () => THREE.BufferGeometry;
  createShape: () => CANNON.Shape;
  rotationOffset?: CANNON.Quaternion;
}

const THEMES: Record<string, { name: string, items: ThemeItem[] }> = {
  fruit: {
    name: 'Fruit Market',
    items: [
      { 
        id: 'watermelon', name: 'Square Watermelon', color: '#166534', 
        texture: 'https://loremflickr.com/512/512/watermelon,pattern',
        createGeometry: () => new THREE.BoxGeometry(2.2, 2.2, 2.2),
        createShape: () => new CANNON.Box(new CANNON.Vec3(1.1, 1.1, 1.1))
      },
      { 
        id: 'orange', name: 'Orange', color: '#ea580c', 
        texture: 'https://loremflickr.com/512/512/orange,skin',
        createGeometry: () => new THREE.SphereGeometry(1.5, 12, 12),
        createShape: () => new CANNON.Sphere(1.5)
      },
      { 
        id: 'pineapple_slice', name: 'Pineapple Slice', color: '#facc15', 
        texture: 'https://loremflickr.com/512/512/pineapple,texture',
        createGeometry: () => new THREE.CylinderGeometry(1.4, 1.4, 0.6, 12),
        createShape: () => new CANNON.Cylinder(1.4, 1.4, 0.6, 16),
        rotationOffset: ROT_X_NEG_90
      },
      { 
        id: 'pineapple_ring', name: 'Pineapple Ring', color: '#fbbf24', 
        texture: 'https://loremflickr.com/512/512/pineapple,ring',
        createGeometry: () => new THREE.TorusGeometry(1.1, 0.4, 6, 32),
        createShape: () => new CANNON.Sphere(1.4) // Simplified physics
      },
      { 
        id: 'strawberry', name: 'Strawberry', color: '#dc2626', 
        texture: 'https://loremflickr.com/512/512/strawberry,texture',
        createGeometry: () => {
          const points = [];
          for (let i = 0; i < 10; i++) {
            points.push(new THREE.Vector2(Math.sin(i * 0.3) * 1.5 + 0.1, (i - 5) * 0.5));
          }
          return new THREE.LatheGeometry(points, 12);
        },
        createShape: () => new CANNON.Cylinder(0.1, 1.5, 2.5, 16),
        rotationOffset: ROT_X_NEG_90
      },
      { 
        id: 'starfruit', name: 'Starfruit Slice', color: '#ca8a04', 
        texture: 'https://loremflickr.com/512/512/starfruit,texture',
        createGeometry: () => {
          const shape = new THREE.Shape();
          const outerRadius = 1.8;
          const innerRadius = 0.8;
          for (let i = 0; i < 10; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i / 10) * Math.PI * 2;
            if (i === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          }
          return new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.1 });
        },
        createShape: () => new CANNON.Cylinder(1.8, 1.8, 0.6, 16),
        rotationOffset: ROT_X_NEG_90
      },
      { 
        id: 'banana', name: 'Banana', color: '#facc15', 
        texture: 'https://loremflickr.com/512/512/banana,skin',
        createGeometry: () => {
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.5, 1.5, 0), new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(1.5, 1.5, 0));
          return new THREE.TubeGeometry(curve, 8, 0.6, 4, false);
        },
        createShape: () => new CANNON.Box(new CANNON.Vec3(1.5, 0.6, 0.6))
      },
      { id: 'grapes', name: 'Grape Cluster', color: '#7c3aed', texture: 'https://loremflickr.com/512/512/grapes,texture', createGeometry: () => new THREE.IcosahedronGeometry(1.6, 0), createShape: () => new CANNON.Sphere(1.6) },
      { id: 'melon', name: 'Cantaloupe', color: '#84cc16', texture: 'https://loremflickr.com/512/512/melon,texture', createGeometry: () => new THREE.SphereGeometry(1.7, 12, 12), createShape: () => new CANNON.Sphere(1.7) },
      { id: 'blueberry', name: 'Blueberry', color: '#2563eb', texture: 'https://loremflickr.com/512/512/blueberry,texture', createGeometry: () => new THREE.SphereGeometry(1.2, 6, 6), createShape: () => new CANNON.Sphere(1.2) },
    ]
  },
  gems: {
    name: 'Shiny Gems',
    items: [
      { id: 'ruby', name: 'Ruby Box', color: '#ef4444', createGeometry: () => new THREE.BoxGeometry(2, 2, 2), createShape: () => new CANNON.Box(new CANNON.Vec3(1,1,1)) },
      { id: 'sapphire', name: 'Sapphire', color: '#3b82f6', createGeometry: () => new THREE.IcosahedronGeometry(1.5), createShape: () => new CANNON.Sphere(1.4) },
      { id: 'emerald', name: 'Emerald', color: '#10b981', createGeometry: () => new THREE.OctahedronGeometry(1.6), createShape: () => new CANNON.Sphere(1.4) },
      { id: 'amethyst', name: 'Amethyst', color: '#a855f7', createGeometry: () => new THREE.DodecahedronGeometry(1.5), createShape: () => new CANNON.Sphere(1.5) },
      { id: 'gold', name: 'Gold Bar', color: '#eab308', createGeometry: () => new THREE.BoxGeometry(2.5, 1, 1), createShape: () => new CANNON.Box(new CANNON.Vec3(1.25, 0.5, 0.5)) },
      { id: 'diamond', name: 'Diamond', color: '#06b6d4', createGeometry: () => new THREE.ConeGeometry(1.5, 2, 6), createShape: () => new CANNON.Cylinder(0.1, 1.5, 2, 6), rotationOffset: ROT_X_NEG_90 },
      { id: 'onyx', name: 'Onyx', color: '#1f2937', createGeometry: () => new THREE.BoxGeometry(2.2, 2.2, 2.2), createShape: () => new CANNON.Box(new CANNON.Vec3(1.1, 1.1, 1.1)) },
      { id: 'pearl', name: 'Pearl', color: '#f3f4f6', createGeometry: () => new THREE.SphereGeometry(1.5, 32, 32), createShape: () => new CANNON.Sphere(1.5) },
      { id: 'garnet', name: 'Garnet', color: '#9f1239', createGeometry: () => new THREE.TetrahedronGeometry(1.8), createShape: () => new CANNON.Sphere(1.4) },
      { id: 'topaz', name: 'Topaz', color: '#f97316', createGeometry: () => new THREE.CylinderGeometry(1.2, 1.2, 1, 6), createShape: () => new CANNON.Cylinder(1.2, 1.2, 1, 6), rotationOffset: ROT_X_NEG_90 },
    ]
  }
};

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
  const [isPaused, setIsPaused] = useState(false);
  const [currentThemeId, setCurrentThemeId] = useState<string>('fruit');
  const [level, setLevel] = useState(0);
  const [tray, setTray] = useState<GameItem[]>([]);
  const trayRef = useRef<GameItem[]>([]);

  // Sync tray state to ref for use in animate loop
  useEffect(() => {
    trayRef.current = tray;
  }, [tray]);

  const [loadedTextures, setLoadedTextures] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [isMatching, setIsMatching] = useState(false);
  const [isLosing, setIsLosing] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);
  const [particleBursts, setParticleBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const uiTrayRef = useRef<HTMLDivElement>(null);
  const trayNDCRef = useRef<{ left: number; right: number; centerY: number }>({ left: -0.8, right: 0.8, centerY: -0.8 });
  const trayCapturedRef = useRef(false);
  const rotationRef = useRef(0);
  const clickedItemRef = useRef<GameItem | null>(null);
  const isPausedRef = useRef(false);

  // Get current theme object
  const theme = THEMES[currentThemeId];

  // Sync rotationRef
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // Sync isPausedRef
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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
  const overlaySceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const overlayCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const itemMaterialRef = useRef<CANNON.Material | null>(null);
  const itemsRef = useRef<GameItem[]>([]);
  const texturesRef = useRef<Record<string, THREE.Texture>>({});
  const trayScaleRef = useRef(0.5);
  const requestRef = useRef<number>(0);

  // --- Game Logic ---

  // Pre-load all theme textures on mount or theme change
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    theme.items.forEach(type => {
      if (type.texture && !texturesRef.current[type.id]) {
        texturesRef.current[type.id] = loader.load(type.texture, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          setLoadedTextures(prev => ({ ...prev, [type.id]: true }));
        });
      }
    });
  }, [theme]);

  const initScene = useCallback(() => {
    if (!containerRef.current) return () => {};

    // --- Physics Setup ---
    const world = new CANNON.World();
    world.gravity.set(0, -60, 0); // Stronger gravity for heavier feel
    world.allowSleep = true;
    worldRef.current = world;

    // Physics Materials
    const groundMaterial = new CANNON.Material('ground');
    const itemMaterial = new CANNON.Material('item');
    itemMaterialRef.current = itemMaterial;
    
    const groundItemContact = new CANNON.ContactMaterial(groundMaterial, itemMaterial, {
      friction: 0.5,
      restitution: 0.2, // Lower restitution for heavier, solid feel
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    world.addContactMaterial(groundItemContact);

    const itemItemContact = new CANNON.ContactMaterial(itemMaterial, itemMaterial, {
      friction: 0.4,
      restitution: 0.3, // Slight bounce
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
    sceneRef.current = scene;

    const overlayScene = new THREE.Scene();
    overlaySceneRef.current = overlayScene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    const overlayCamera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    overlayCamera.position.set(0, 0, 0); // Camera at origin for simpler overlay math
    overlayCamera.lookAt(0, 0, -1);
    overlayCameraRef.current = overlayCamera;
    
    const updateCamera = () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.aspect = aspect;
      overlayCamera.aspect = aspect;
      
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
      overlayCamera.updateProjectionMatrix();
    };
    
    updateCamera();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true });
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isMobile;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.2) : Math.min(window.devicePixelRatio, 2));
    
    // Clear container to prevent duplicate canvases in Strict Mode (Fixes double grid issue)
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);
    }
    rendererRef.current = renderer;
    
    // Ensure canvas is layered correctly
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '10';
    renderer.domElement.style.pointerEvents = 'auto';

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = !isMobile;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffffff, 2.5);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // Overlay Lights - Ensure items in tray are well-lit
    const overlayAmbient = new THREE.AmbientLight(0xffffff, 1.5);
    overlayScene.add(overlayAmbient);
    const overlayPoint = new THREE.PointLight(0xffffff, 2.0);
    overlayPoint.position.set(0, 10, 20);
    overlayScene.add(overlayPoint);

    // Floor - Only grid for better transparency
    // Reduced size from 50 to 22 to prevent covering the UI Tray at the bottom
    const grid = new THREE.GridHelper(22, 22, 0x94a3b8, 0x94a3b8);
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
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
      
      const camera = cameraRef.current;
      if (!camera) return;

      // Only run physics and game logic if not paused
      if (!isPausedRef.current) {
        // Step physics with more sub-steps for better collision accuracy and to reduce overlapping
        world.step(1 / 60, 1 / 60, isMobile ? 5 : 10);

        // Update camera based on rotation
        const radius = 35;
        const angle = rotationRef.current;
        camera.position.x = Math.sin(angle) * radius;
        camera.position.z = Math.cos(angle) * radius;
        camera.lookAt(0, 5, 0);
        camera.updateMatrixWorld(); // Ensure world matrix is fresh for any coordinate conversions

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
        if (uiTrayRef.current && overlayCameraRef.current && overlaySceneRef.current) {
          const oCamera = overlayCameraRef.current;
          
          // Retry capturing NDC if it's not yet captured or layout might have changed
          if (!trayCapturedRef.current) {
            if (updateTrayNDC()) {
              trayCapturedRef.current = true;
            }
          }

          const { left, right, centerY } = trayNDCRef.current;
          const trayDistance = 30; 
          
          // Calculate camera-space half-dimensions at tray distance
          const halfH = Math.abs(trayDistance) * Math.tan(THREE.MathUtils.degToRad(oCamera.fov / 2));
          const halfW = halfH * oCamera.aspect;

          const getSlotPosOverlay = (index: number) => {
            const ndcX = left + (index + 0.5) * (right - left) / TRAY_SIZE;
            return new THREE.Vector3(ndcX * halfW, centerY * halfH, -trayDistance);
          };

          // Scale items to fit comfortably in slots
          const trayWidthOverlay = (right - left) * halfW;
          const slotWidthOverlay = trayWidthOverlay / TRAY_SIZE;
          const targetScale = (slotWidthOverlay * 0.85) / 2.25;
          trayScaleRef.current = Math.max(0.1, Math.min(0.5, targetScale));
          const currentTrayScale = trayScaleRef.current;

          currentTray.forEach((item, index) => {
            const targetPos = getSlotPosOverlay(index);
            item.targetPos = targetPos;
            
            // Ensure item is in overlay scene
            if (item.mesh.parent !== overlaySceneRef.current) {
              if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
              overlaySceneRef.current?.add(item.mesh);
            }

            // In overlay space, identity rotation means facing the camera
            item.mesh.quaternion.set(0, 0, 0, 1);

            // Always lerp if not at targetPos to handle shifting smoothly
            const dist = item.mesh.position.distanceTo(targetPos);
            if (dist > 0.01) {
              item.mesh.position.lerp(targetPos, 0.2);
              
              const s = item.mesh.scale.x;
              const nextS = THREE.MathUtils.lerp(s, currentTrayScale, 0.15);
              item.mesh.scale.set(nextS, nextS, nextS);
            } else {
              item.mesh.position.copy(targetPos);
              item.mesh.scale.set(currentTrayScale, currentTrayScale, currentTrayScale);
              item.isTransitioning = false;
              item.isMoving = false;
            }
          });

          // Garbage collect overlay scene to remove items that were eliminated
          overlaySceneRef.current.children.forEach(child => {
            if (child.userData.isGameItem) {
              const isInTray = currentTray.some(item => item.mesh === child);
              if (!isInTray) {
                overlaySceneRef.current?.remove(child);
              }
            }
          });
        }
      }

      // Render main scene
      renderer.render(scene, camera);
      
      // Render Overlay
      if (overlaySceneRef.current && overlayCameraRef.current) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(overlaySceneRef.current, overlayCameraRef.current);
        renderer.autoClear = true;
      }
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
      if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
      if (item.body) worldRef.current?.removeBody(item.body);
    });
    itemsRef.current = [];

    // Clear tray items
    trayRef.current.forEach(item => {
      if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
      if (item.body) worldRef.current?.removeBody(item.body);
    });
    setTray([]);
    trayRef.current = [];
  }, []);

  const spawnItems = useCallback((typeCount: number, triplesPerType: number, currentTheme: typeof THEMES['fruit']) => {
    if (!sceneRef.current || !worldRef.current) return;

    // Clear existing
    clearAllItems();

    const newItems: GameItem[] = [];
    const typesToUse = [...currentTheme.items].sort(() => Math.random() - 0.5).slice(0, typeCount);
    const totalCount = typeCount * triplesPerType * 3;

    for (let i = 0; i < totalCount; i++) {
      const type = typesToUse[i % typeCount];
      const geometry = type.createGeometry();
      
      const material = new THREE.MeshStandardMaterial({ 
        map: texturesRef.current[type.id] || null,
        color: loadedTextures[type.id] ? 0xffffff : type.color, 
        roughness: 0.5,
        metalness: 0.0,
        emissive: loadedTextures[type.id] ? 0x222222 : new THREE.Color(type.color).multiplyScalar(0.2),
        emissiveIntensity: 0.5
      });
      
      // Improve texture mapping
      if (texturesRef.current[type.id]) {
        texturesRef.current[type.id].wrapS = THREE.RepeatWrapping;
        texturesRef.current[type.id].wrapT = THREE.RepeatWrapping;
        texturesRef.current[type.id].repeat.set(1, 1);
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.isGameItem = true;

      // Add bright outline for better visibility
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
      const outline = new THREE.LineSegments(edges, lineMaterial);
      mesh.add(outline);
      
      // Physics Body (Modular)
      const shape = type.createShape();
      
      // [Physics Calculation] Estimate volume to determine mass and air resistance
      let volume = 3; // Fallback
      if (shape instanceof CANNON.Box) {
        const { x, y, z } = shape.halfExtents;
        volume = x * y * z * 8;
      } else if (shape instanceof CANNON.Sphere) {
        volume = (4 / 3) * Math.PI * Math.pow(shape.radius, 3);
      } else if (shape instanceof CANNON.Cylinder) {
        const s = shape as any;
        const r = (s.radiusTop + s.radiusBottom) * 0.5;
        volume = Math.PI * r * r * s.height;
      }

      // Volume affects physics:
      // 1. Mass: Proportional to volume (Density constant)
      // 2. Damping: Inverse to size (Smaller objects float more/have more air resistance relative to mass)
      const damping = Math.max(0.05, Math.min(0.6, 1.2 / Math.sqrt(volume || 1)));
      const mass = Math.max(0.5, volume * 0.6);

      const body = new CANNON.Body({
        mass: mass,
        material: itemMaterialRef.current || undefined,
        angularDamping: damping * 0.5,
        linearDamping: damping, // Simulates air resistance (smaller = slower terminal velocity)
      });

      // Use item-specific rotation offset if defined (e.g. for cylinders)
      if (type.rotationOffset) {
        body.addShape(shape, new CANNON.Vec3(), type.rotationOffset);
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
    setIsPaused(false);
    trayCapturedRef.current = false; // Reset capture flag for new game
    setTimeLeft(config.time);
    setScore(0);
    spawnItems(config.types, config.triplesPerType, THEMES[currentThemeId]);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    // Prevent event from bubbling to platform UI
    if (event.nativeEvent) {
      event.nativeEvent.stopImmediatePropagation();
    }
    event.stopPropagation();
    
    if (gameState !== 'playing' || isPaused) return;
    
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
    if (gameState !== 'playing' || isPaused) return;

    if (event.buttons === 1) {
      const deltaX = event.clientX - lastMouseX;
      if (Math.abs(deltaX) > 5) {
        setIsDragging(true);
      }
      const rotationSpeed = isMobile ? 0.004 : 0.006;
      setRotation(prev => prev - deltaX * rotationSpeed);
      setLastMouseX(event.clientX);
    }
  };

    const handlePointerUp = (event: React.PointerEvent) => {
      if (gameState !== 'playing' || isPaused) return;
      
      const clickedItem = clickedItemRef.current;
      if (clickedItem && !isDragging) {
        const item = clickedItem;
        
        // 1. Flush existing matches synchronously before adding new item
        // This implements "eliminate before placing" to prevent unfair game overs
        const typeCounts: Record<string, number> = {};
        trayRef.current.forEach(i => {
          typeCounts[i.typeId] = (typeCounts[i.typeId] || 0) + 1;
        });
        const matchedTypeId = Object.keys(typeCounts).find(tid => typeCounts[tid] >= 3);
        
        if (matchedTypeId) {
          const matchedItems = trayRef.current.filter(i => i.typeId === matchedTypeId).slice(0, 3);
          const remainingTray = trayRef.current.filter(i => !matchedItems.includes(i));
          
          // Remove matched from scene immediately
          matchedItems.forEach(i => {
            if (i.mesh.parent) i.mesh.parent.remove(i.mesh);
            if (i.body) worldRef.current?.removeBody(i.body);
          });
          
          setScore(s => s + 100);
          setIsMatching(false);
          setTray(remainingTray);
          trayRef.current = remainingTray;
        }

        // 2. Prevent clicking when tray is full (9 items)
        if (item.isMoving || trayRef.current.length > TRAY_SIZE) {
          clickedItemRef.current = null;
          setIsDragging(false);
          return;
        }

        // Mark as moving immediately to prevent double-clicks
        item.isMoving = true;
        item.isTransitioning = true;
        
        // Seamless transition to overlay scene using NDC projection
        if (cameraRef.current && overlayCameraRef.current && overlaySceneRef.current) {
          const mainCamera = cameraRef.current;
          const oCamera = overlayCameraRef.current;
          
          // 1. Capture current screen position (NDC)
          item.mesh.updateMatrixWorld();
          const worldPos = new THREE.Vector3();
          item.mesh.getWorldPosition(worldPos);
          worldPos.project(mainCamera); // Convert to NDC (-1 to 1)
          
          // 2. Move to overlay scene
          sceneRef.current?.remove(item.mesh);
          overlaySceneRef.current.add(item.mesh);
          
          // 3. Unproject NDC to overlay scene space at a fixed distance
          const trayDistance = 30;
          const halfH = Math.abs(trayDistance) * Math.tan(THREE.MathUtils.degToRad(oCamera.fov / 2));
          const halfW = halfH * oCamera.aspect;
          
          item.mesh.position.set(worldPos.x * halfW, worldPos.y * halfH, -trayDistance);
          item.mesh.quaternion.set(0, 0, 0, 1); // Face camera in UI space
        }

        item.mesh.rotation.set(0, 0, 0);
        
        // Ensure tray items are always visible and correctly sorted in overlay
        if (item.mesh.material) {
          const materials = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
          materials.forEach(m => {
            m.depthTest = true;
            m.transparent = true;
            m.depthWrite = true; 
          });
        }
        // Render order based on index will be updated in setTray
        item.mesh.renderOrder = 999;

        // Remove from physics world
        if (item.body && worldRef.current) {
          worldRef.current.removeBody(item.body);
          item.body = undefined;
        }

        setTray(prevTray => {
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

  // Handle Game Over sequence separately to ensure it completes
  useEffect(() => {
    if (isLosing) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      const timer = setTimeout(() => {
        setGameState('lost');
        setIsLosing(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isLosing]);

  // Check for matches in tray
  useEffect(() => {
    if (gameState !== 'playing' || tray.length === 0) return;

    const typeCounts: Record<string, number> = {};
    tray.forEach(item => {
      typeCounts[item.typeId] = (typeCounts[item.typeId] || 0) + 1;
    });

    const matchedTypeId = Object.keys(typeCounts).find(typeId => typeCounts[typeId] >= 3);

    if (tray.length > TRAY_SIZE) {
      setIsLosing(true);
    } else if (matchedTypeId) {
      setIsMatching(true);
      const timer = setTimeout(() => {
        const matchedItems = tray.filter(item => item.typeId === matchedTypeId).slice(0, 3);
        const remainingTray = tray.filter(item => !matchedItems.includes(item));
        
        // Update ref immediately to prevent animate loop from re-adding
        trayRef.current = remainingTray;
        setTray(remainingTray);
        
        // Remove matched from scene/camera
        matchedItems.forEach(item => {
          if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
          if (item.body) worldRef.current?.removeBody(item.body);
        });
        
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
    }
  }, [tray]);

  // Timer
  useEffect(() => {
    if (gameState !== 'playing' || timeLeft <= 0 || !isPageVisible || isPaused) {
      if (timeLeft === 0 && gameState === 'playing') setGameState('lost');
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [gameState, timeLeft, isPageVisible, isPaused]);

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
          <div key={burst.id} className="absolute inset-0 pointer-events-none z-60">
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
          className={`absolute ${isMobile ? 'bottom-24' : 'bottom-4'} left-1/2 -translate-x-1/2 w-[90%] max-w-125 pointer-events-none z-1`}
        >
          <motion.div 
            animate={(isMatching || isLosing) ? { 
              x: isLosing ? [-15, 15, -15, 15, -15, 15, 0] : [0, -5, 5, -5, 5, 0], 
              y: isLosing ? [-5, 5, -5, 5, 0] : 0,
              scale: isLosing ? [1, 1.1, 0.9, 1.1, 1] : [1, 1.02, 1],
              rotate: isLosing ? [-5, 5, -5, 5, 0] : 0
            } : {}}
            transition={{ duration: isLosing ? 0.4 : 0.3, repeat: isLosing ? Infinity : 0 }}
            className="w-full h-20 bg-indigo-900/80 backdrop-blur-xl rounded-2xl border-4 border-indigo-400/50 flex items-center justify-between gap-1 p-2 relative shadow-2xl"
          >
            {isLosing && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-red-500 font-black text-2xl italic tracking-tighter animate-bounce drop-shadow-lg">
                TRAY FULL! GAME OVER
              </div>
            )}
            {/* Visual Slots */}
            {Array.from({ length: TRAY_SIZE }).map((_, i) => (
              <div key={i} className="flex-1 h-full rounded-lg border border-white/30 bg-white/10 shadow-inner" />
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
        <div className={`absolute ${isMobile ? 'top-12' : 'top-0'} left-0 w-full p-1.5 flex justify-between items-start pointer-events-none z-30`}>
            <motion.div 
              animate={isMatching ? { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] } : {}}
              transition={{ delay: 1.2, duration: 0.4 }}
              className={`bg-white/80 backdrop-blur-md ${isMobile ? 'p-1.5 gap-2' : 'p-2 gap-3'} rounded-xl shadow-lg border border-white/20 flex items-center`}
            >
            <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'} text-slate-700 font-bold`}>
              <Trophy className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-yellow-500`} />
              <span className={isMobile ? 'text-xs' : ''}>{score}</span>
            </div>
            <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'} font-bold border-l border-slate-200 ${isMobile ? 'pl-2' : 'pl-3'} ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
              <Timer className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
              <span className={isMobile ? 'text-xs' : ''}>{timeLeft}s</span>
            </div>
            <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'} text-indigo-600 font-bold border-l border-slate-200 ${isMobile ? 'pl-2' : 'pl-3'}`}>
              <Box className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
              <span className={isMobile ? 'text-xs' : ''}>{itemsRef.current.length + tray.length}</span>
            </div>
          </motion.div>
          
          <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
            <button 
              onClick={() => setIsPaused(true)}
              className={`bg-white/80 backdrop-blur-md hover:bg-white text-slate-700 ${isMobile ? 'p-2' : 'p-2.5'} rounded-xl shadow-lg border border-white/20 pointer-events-auto transition-colors flex items-center justify-center`}
              title="Pause Game"
            >
              <Pause className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
            <button 
              onClick={() => setShowRestartConfirm(true)}
              className={`bg-orange-500 hover:bg-orange-600 text-white ${isMobile ? 'p-2' : 'p-2.5'} rounded-xl shadow-lg border border-orange-400 pointer-events-auto transition-colors flex items-center justify-center`}
              title="Restart Level"
            >
              <RotateCcw className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
            <div className={`bg-white/80 backdrop-blur-md ${isMobile ? 'p-1.5' : 'p-2'} rounded-xl shadow-lg border border-white/20`}>
              <span className={`text-slate-500 ${isMobile ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-widest font-bold`}># {level + 1}</span>
            </div>
            {!isMobile && (
              <button 
                onClick={toggleFullscreen}
                className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/20 pointer-events-auto hover:bg-white transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4 text-slate-600" /> : <Maximize className="w-4 h-4 text-slate-600" />}
              </button>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showRestartConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 shadow-2xl max-w-xs w-full text-center"
            >
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">重新開始？</h3>
              <p className="text-slate-500 mb-6">目前的進度將會遺失。</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowRestartConfirm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    setShowRestartConfirm(false);
                    startGame();
                  }}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-200 transition-colors"
                >
                  確定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {isPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 shadow-2xl max-w-xs w-full text-center"
            >
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Pause className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">遊戲暫停</h3>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => setIsPaused(false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  繼續遊戲
                </button>
                <button 
                  onClick={() => {
                    setIsPaused(false);
                    startGame();
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  重新開始
                </button>
                <button 
                  onClick={() => {
                    setIsPaused(false);
                    setGameState('start');
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-5 h-5" />
                  回到主選單
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {isLandscape && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-100 flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center"
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
              {/* Theme Selector */}
              <div className="absolute top-6 right-6">
                <button 
                  onClick={() => {
                    const keys = Object.keys(THEMES);
                    const currentIndex = keys.indexOf(currentThemeId);
                    const nextIndex = (currentIndex + 1) % keys.length;
                    setCurrentThemeId(keys[nextIndex]);
                  }}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors flex items-center gap-2 px-3"
                  title="Change Theme"
                >
                  <span className="text-xs font-bold uppercase">{theme.name}</span>
                  <Palette className="w-5 h-5" />
                </button>
              </div>

              <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Box className="w-10 h-10 text-indigo-600" />
              </div>
              <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">3D 配對消除</h1>
              <p className="text-slate-500 mb-8 leading-relaxed">配對 3 個相同的水果來消除它們。別讓下方的托盤滿了！</p>
              
              <button 
                onClick={startGame}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-lg"
              >
                <Play className="w-6 h-6 fill-current" />
                立即開始
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
                  <h2 className="text-3xl font-black text-slate-900 mb-2">闖關成功！</h2>
                  <p className="text-slate-500 mb-8">你清空了所有物品，還剩餘 {timeLeft} 秒！</p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { setLevel(l => l + 1); startGame(); }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95"
                    >
                      下一關
                    </button>
                    <button 
                      onClick={startGame}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl transition-all active:scale-95"
                    >
                      重新開始
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-10 h-10 text-red-600" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 mb-2">遊戲結束</h2>
                  <p className="text-slate-500 mb-8">
                    {timeLeft === 0 ? "時間到！" : "托盤滿了！"}
                  </p>
                  <button 
                    onClick={startGame}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-5 h-5" />
                    再試一次
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
