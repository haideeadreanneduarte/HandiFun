const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
let scene, camera, renderer, cube, cornerMarkers = [],
    draggingCornerIndex = -1,
    isPinching = false;
let placedGroups = [];
let draggingGroup = null;
let binHoverStartMs = null;
const BIN_DELETE_MS = 3000;
let previousLeftFistX = null;
let previousLeftFistY = null;
let isLeftFist = false;
let activeColor = '#ff00ff';
let pinchThreshold = 0.045;
let currentShape = 'cube';

let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

let lastIndexFingerClick = 0;
let isIndexFingerDown = false;

function saveState() {
    const state = {
        shape: currentShape,
        color: activeColor,
        markers: cornerMarkers.map(m => ({
            x: m.position.x,
            y: m.position.y,
            z: m.position.z
        }))
    };
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    if (history.length > MAX_HISTORY) {
        history.shift();
    } else {
        historyIndex++;
    }
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreState(history[historyIndex]);
        updateUndoRedoButtons();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreState(history[historyIndex]);
        updateUndoRedoButtons();
    }
}

function restoreState(state) {
    currentShape = state.shape;
    activeColor = state.color;
    document.getElementById('shape-selector').value = currentShape;
    cornerMarkers.forEach(marker => scene.remove(marker));
    cornerMarkers = [];
    const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
    state.markers.forEach(pos => {
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0xfffed6
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(pos.x, pos.y, pos.z);
        marker.userData.originalColor = 0xfffed6;
        scene.add(marker);
        cornerMarkers.push(marker);
    });
    createCube();
}

function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = historyIndex <= 0;
    document.getElementById('redo-btn').disabled = historyIndex >= history.length - 1;
}

function resetShape() {
    cornerMarkers.forEach(marker => scene.remove(marker));
    cornerMarkers = [];
    createCube();
    saveState();
}

function exportOBJ() {
    const filled = scene.children.find(ch => ch.name === 'filledCube');
    if (!filled && placedGroups.length === 0) {
        alert('No shape to export!');
        return;
    }

    const prevMarkerVisibility = cornerMarkers.map(m => m.visible);
    const prevWireVisible = cube ? cube.visible : null;
    const prevClearAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 0;

    cornerMarkers.forEach(m => m.visible = false);
    if (cube) cube.visible = false;

    const prevClearColor = new THREE.Color();
    if (renderer.getClearColor) renderer.getClearColor(prevClearColor);
    renderer.setClearColor(0x000000, 0);

    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${currentShape}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    cornerMarkers.forEach((m, i) => m.visible = prevMarkerVisibility[i]);
    if (cube && prevWireVisible !== null) cube.visible = prevWireVisible;
    renderer.setClearColor(prevClearColor, prevClearAlpha || 0);
    renderer.render(scene, camera);
}

function addCurrentShapeToScene() {
    const group = new THREE.Group();
    const filled = scene.children.find(ch => ch.name === 'filledCube');
    if (filled) {
        scene.remove(filled);
        group.add(filled);
    }
    if (cube) {
        scene.remove(cube);
        group.add(cube);
        cube = null;
    }
    cornerMarkers.forEach(m => scene.remove(m));
    cornerMarkers = [];
    group.userData.shape = currentShape;
    scene.add(group);
    placedGroups.push(group);
    createInitialShape(currentShape);
}

function getFacesForShape(shape) {
    switch (shape) {
        case 'cube':
            return [
                [0, 1, 3, 2], // front
                [1, 5, 7, 3], // right
                [5, 4, 6, 7], // back
                [4, 0, 2, 6], // left
                [2, 3, 7, 6], // top
                [4, 5, 1, 0] // bottom
            ];
        case 'pyramid':
            return [
                [0, 1, 2, 3], // base
                [0, 4], 
                [1, 4],
                [2, 4],
                [3, 4]
            ];
        case 'sphere':
        case 'cylinder':
        case 'cone':
            const faces = [];
            for (let i = 0; i < cornerMarkers.length - 1; i++) {
                faces.push([i, i + 1]);
            }
            return faces;
        default:
            return [];
    }
}

function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 4;
    renderer = new THREE.WebGLRenderer({
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('three-canvas').appendChild(renderer.domElement);
    createCube();
    saveState(); 
    animate();
}

function createCube() {
    if (cube) scene.remove(cube);
    scene.children = scene.children.filter(child => child.name !== 'filledCube');
    if (currentShape === 'sphere') {
        if (cornerMarkers.length === 0) {
            const size = 2;
            const half = size / 2;
            const r = half;
            const sphereCornerPositions = [
                [0, r, 0],
                [r, 0, 0],
                [0, 0, r],
                [-r, 0, 0],
                [0, 0, -r],
                [0, -r, 0],
                [r * 0.7, r * 0.7, 0],
                [r * 0.7, -r * 0.7, 0]
            ];
            const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
            sphereCornerPositions.forEach(([x, y, z]) => {
                const markerMat = new THREE.MeshBasicMaterial({ color: 0xfffed6 });
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.set(x, y, z);
                marker.userData.originalColor = 0xfffed6;
                scene.add(marker);
                cornerMarkers.push(marker);
            });
        }

        let radius = 1;
        if (cornerMarkers.length > 0) {
            const total = cornerMarkers.reduce((sum, m) => sum + m.position.length(), 0);
            radius = total / cornerMarkers.length;
        }

        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(activeColor),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const filled = new THREE.Mesh(geometry, material);
        filled.name = 'filledCube';
        scene.add(filled);

        const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        cube = new THREE.Mesh(geometry, wireMaterial);
        scene.add(cube);
        return;
    }

    if (currentShape === 'cylinder') {
        if (cornerMarkers.length === 0) {
            const size = 2;
            const half = size / 2;
            const positions = [
                [-half, -half, 0],
                [0, -half, -half],
                [half, -half, 0],
                [0, -half, half],
                [-half, half, 0],
                [0, half, -half],
                [half, half, 0],
                [0, half, half]
            ];
            const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
            positions.forEach(([x, y, z]) => {
                const markerMat = new THREE.MeshBasicMaterial({ color: 0xfffed6 });
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.set(x, y, z);
                marker.userData.originalColor = 0xfffed6;
                scene.add(marker);
                cornerMarkers.push(marker);
            });
        }
        const bottomIdx = [0, 1, 2, 3];
        const topIdx = [4, 5, 6, 7];
        const bottomCenter = bottomIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / bottomIdx.length);
        const topCenter = topIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / topIdx.length);
        const bottomY = bottomCenter.y;
        const topY = topCenter.y;
        const radiusBottom = bottomIdx.reduce((sum, i) => {
            const p = cornerMarkers[i].position;
            const dx = p.x - bottomCenter.x;
            const dz = p.z - bottomCenter.z;
            return sum + Math.hypot(dx, dz);
        }, 0) / bottomIdx.length;
        const radiusTop = topIdx.reduce((sum, i) => {
            const p = cornerMarkers[i].position;
            const dx = p.x - topCenter.x;
            const dz = p.z - topCenter.z;
            return sum + Math.hypot(dx, dz);
        }, 0) / topIdx.length;
        const height = Math.max(0.001, Math.abs(topY - bottomY));
        const centerY = (topY + bottomY) / 2;

        const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(activeColor),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const filled = new THREE.Mesh(geometry, material);
        filled.name = 'filledCube';
        filled.position.y = centerY;
        scene.add(filled);

        const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        cube = new THREE.Mesh(geometry, wireMaterial);
        cube.position.y = centerY;
        scene.add(cube);
        return;
    }

    if (currentShape === 'cone') {
        if (cornerMarkers.length === 0) {
            const size = 2;
            const half = size / 2;
            const positions = [
                [-half, -half, 0],
                [0, -half, -half],
                [half, -half, 0],
                [0, -half, half],
                [0, half, 0]
            ];
            const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
            positions.forEach(([x, y, z]) => {
                const markerMat = new THREE.MeshBasicMaterial({ color: 0xfffed6 });
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.set(x, y, z);
                marker.userData.originalColor = 0xfffed6;
                scene.add(marker);
                cornerMarkers.push(marker);
            });
        }
        const baseIdx = [0, 1, 2, 3];
        const apexIdx = 4;
        const baseCenter = baseIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / baseIdx.length);
        const baseY = baseCenter.y;
        const apex = cornerMarkers[apexIdx].position;
        const apexY = apex.y;
        const radius = baseIdx.reduce((sum, i) => {
            const p = cornerMarkers[i].position;
            const dx = p.x - baseCenter.x;
            const dz = p.z - baseCenter.z;
            return sum + Math.hypot(dx, dz);
        }, 0) / baseIdx.length;
        const height = Math.max(0.001, Math.abs(apexY - baseY));
        const centerY = (apexY + baseY) / 2;

        const geometry = new THREE.ConeGeometry(radius, height, 16);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(activeColor),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const filled = new THREE.Mesh(geometry, material);
        filled.name = 'filledCube';
        filled.position.y = centerY;
        scene.add(filled);

        const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        cube = new THREE.Mesh(geometry, wireMaterial);
        cube.position.y = centerY;
        scene.add(cube);
        return;
    }

    if (cornerMarkers.length > 0) {
        const vertices = new Float32Array(cornerMarkers.map(m => m.position).flatMap(v => [v.x, v.y, v.z]));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const indices = getIndicesForShape(currentShape, cornerMarkers.length);
        if (indices.length > 0) {
            geometry.setIndex(indices);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(activeColor),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const filledCube = new THREE.Mesh(geometry, material);
        filledCube.name = 'filledCube';
        scene.add(filledCube);

        const wireMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true
        });
        cube = new THREE.Mesh(geometry, wireMaterial);
        scene.add(cube);
    } else {
        createInitialShape(currentShape);
    }
}

function getIndicesForShape(shape, vertexCount) {
    switch (shape) {
        case 'cube':
            if (vertexCount >= 8) {
                return [
                    0, 1, 3, 0, 3, 2,
                    1, 5, 7, 1, 7, 3,
                    5, 4, 6, 5, 6, 7,
                    4, 0, 2, 4, 2, 6,
                    2, 3, 7, 2, 7, 6,
                    4, 5, 1, 4, 1, 0
                ];
            }
            break;
        case 'pyramid':
            if (vertexCount >= 5) {
                return [
                    0, 1, 2, 0, 2, 3, // base
                    0, 4, 1, // side 1
                    1, 4, 2, // side 2
                    2, 4, 3, // side 3
                    3, 4, 0 // side 4
                ];
            }
            break;
        case 'sphere':
            return [];
        case 'cylinder':
        case 'cone':
            {
                const indices = [];
                for (let i = 0; i < vertexCount - 2; i++) {
                    indices.push(0, i + 1, i + 2);
                }
                return indices;
            }
    }
    return [];
}

function createInitialShape(shape) {
    cornerMarkers.forEach(marker => scene.remove(marker));
    cornerMarkers = [];
    let corners = [];
    const size = 2;
    const half = size / 2;

    switch (shape) {
        case 'cube':
            corners = [
                [-half, -half, -half],
                [half, -half, -half],
                [-half, half, -half],
                [half, half, -half],
                [-half, -half, half],
                [half, -half, half],
                [-half, half, half],
                [half, half, half],
            ];
            break;
        case 'pyramid':
            corners = [
                [-half, -half, -half],
                [half, -half, -half],
                [half, -half, half],
                [-half, -half, half],
                [0, half, 0] // apex
            ];
            break;
        case 'sphere':
            const r = half;
            corners = [
                [0, r, 0], // top
                [r, 0, 0], // right
                [0, 0, r], // front
                [-r, 0, 0], // left
                [0, 0, -r], // back
                [0, -r, 0], // bottom
                [r * 0.7, r * 0.7, 0],
                [r * 0.7, -r * 0.7, 0]
            ];
            break;
        case 'cylinder':
            corners = [
                [-half, -half, 0],
                [0, -half, -half],
                [half, -half, 0],
                [0, -half, half],
                // Top circle
                [-half, half, 0],
                [0, half, -half],
                [half, half, 0],
                [0, half, half]
            ];
            break;
        case 'cone':
            corners = [
                // Base circle
                [-half, -half, 0],
                [0, -half, -half],
                [half, -half, 0],
                [0, -half, half],
                // Apex
                [0, half, 0]
            ];
            break;
    }

    const geometry = createGeometryForShape(shape, size);
    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(activeColor),
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const filledCube = new THREE.Mesh(geometry, material);
    filledCube.name = 'filledCube';
    scene.add(filledCube);

    const wireMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true
    });
    cube = new THREE.Mesh(geometry, wireMaterial);
    scene.add(cube);

    const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
    corners.forEach(([x, y, z]) => {
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0xfffed6
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(x, y, z);
        marker.userData.originalColor = 0xfffed6;
        scene.add(marker);
        cornerMarkers.push(marker);
    });
}

function createGeometryForShape(shape, size) {
    const half = size / 2;
    switch (shape) {
        case 'cube':
            return new THREE.BoxGeometry(size, size, size);
        case 'pyramid':
            const pyramidGeo = new THREE.BufferGeometry();
            const pyramidVertices = new Float32Array([
                -half, -half, -half,
                half, -half, -half,
                half, -half, half,
                -half, -half, half,
                0, half, 0
            ]);
            pyramidGeo.setAttribute('position', new THREE.BufferAttribute(pyramidVertices, 3));
            pyramidGeo.setIndex([
                0, 1, 2, 0, 2, 3,
                0, 4, 1,
                1, 4, 2,
                2, 4, 3,
                3, 4, 0
            ]);
            return pyramidGeo;
        case 'sphere':
            return new THREE.SphereGeometry(half, 16, 16);
        case 'cylinder':
            return new THREE.CylinderGeometry(half, half, size, 16);
        case 'cone':
            return new THREE.ConeGeometry(half, size, 16);
        default:
            return new THREE.BoxGeometry(size, size, size);
    }
}

function drawColorPickerWheel() {
    const canvas = document.getElementById('color-picker-canvas');
    const ctx = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const toRad = Math.PI / 180;

    for (let angle = 0; angle < 360; angle++) {
        ctx.beginPath();
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius, angle * toRad, (angle + 1) * toRad);
        ctx.closePath();
        ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
        ctx.fill();
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

function updateCanvasSize() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

function checkIndexFingerClick(indexTip) {
    const screenX = (1 - indexTip.x) * window.innerWidth;
    const screenY = indexTip.y * window.innerHeight;

    const shapeSelector = document.getElementById('shape-selector');
    const shapeSelectorRect = shapeSelector.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, shapeSelectorRect)) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            const shapes = ['cube', 'pyramid', 'sphere', 'cylinder', 'cone'];
            const currentIndex = shapes.indexOf(currentShape);
            const nextIndex = (currentIndex + 1) % shapes.length;
            currentShape = shapes[nextIndex];
            shapeSelector.value = currentShape;
            resetShape();
        }
        highlightElement(shapeSelector);
        return true;
    }

    const undoBtn = document.getElementById('undo-btn');
    const undoBtnRect = undoBtn.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, undoBtnRect) && !undoBtn.disabled) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            undo();
        }
        highlightElement(undoBtn);
        return true;
    }

    const redoBtn = document.getElementById('redo-btn');
    const redoBtnRect = redoBtn.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, redoBtnRect) && !redoBtn.disabled) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            redo();
        }
        highlightElement(redoBtn);
        return true;
    }

    const resetBtn = document.getElementById('reset-btn');
    const resetBtnRect = resetBtn.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, resetBtnRect)) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            resetShape();
        }
        highlightElement(resetBtn);
        return true;
    }

    const exportBtn = document.getElementById('export-btn');
    const exportBtnRect = exportBtn.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, exportBtnRect)) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            exportOBJ();
        }
        highlightElement(exportBtn);
        return true;
    }

    const addBtn = document.getElementById('add-shape-btn');
    const addBtnRect = addBtn.getBoundingClientRect();
    if (isPointInRect(screenX, screenY, addBtnRect)) {
        if (!isIndexFingerDown) {
            isIndexFingerDown = true;
            addCurrentShapeToScene();
        }
        highlightElement(addBtn);
        return true;
    }

    isIndexFingerDown = false;
    clearHighlights();
    return false;
}

function isPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function highlightElement(element) {
    clearHighlights();
    element.style.boxShadow = '0 0 15px 5px rgba(255, 255, 0, 0.8)';
    element.style.transform = 'scale(1.05)';
}

function clearHighlights() {
    const elements = [
        document.getElementById('shape-selector'),
        document.getElementById('undo-btn'),
        document.getElementById('redo-btn'),
        document.getElementById('reset-btn'),
        document.getElementById('export-btn'),
        document.getElementById('add-shape-btn')
    ];
    elements.forEach(el => {
        el.style.boxShadow = '';
        el.style.transform = '';
    });
}

function detectDrag(handLandmarks) {
    const indexTip = handLandmarks[8];
    const thumbTip = handLandmarks[4];
    const screenX = (1 - indexTip.x) * window.innerWidth;
    const screenY = indexTip.y * window.innerHeight;
    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

    const clickedUI = checkIndexFingerClick(indexTip);
    if (clickedUI) {
        return;
    }

    const colorCanvas = document.getElementById('color-picker-canvas');
    const colorRect = colorCanvas.getBoundingClientRect();
    const inColorPicker = screenX >= colorRect.left && screenX <= colorRect.right && screenY >= colorRect.top && screenY <= colorRect.bottom;

    if (inColorPicker && pinchDist < pinchThreshold) {
        const localX = screenX - colorRect.left;
        const localY = screenY - colorRect.top;
        const ctx = colorCanvas.getContext('2d');
        const pixel = ctx.getImageData(localX, localY, 1, 1).data;
        const hex = `#${[pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('')}`;
        activeColor = hex;
        createCube();
    }

    let hoveringIndex = -1;
    for (let i = 0; i < cornerMarkers.length; i++) {
        const marker = cornerMarkers[i];
        const projected = marker.position.clone().project(camera);
        const markerX = (projected.x + 1) / 2 * window.innerWidth;
        const markerY = (1 - projected.y) / 2 * window.innerHeight;
        const dist = Math.hypot(screenX - markerX, screenY - markerY);
        if (dist < 40) {
            hoveringIndex = i;
            marker.material.color.set(0xff9700);
        } else {
            marker.material.color.set(marker.userData.originalColor);
        }
    }

    const isCurrentlyPinching = pinchDist < pinchThreshold;

    if (draggingCornerIndex === -1 && isCurrentlyPinching && hoveringIndex !== -1) {
        draggingCornerIndex = hoveringIndex;
    }

    if (draggingCornerIndex !== -1 && isCurrentlyPinching) {
        const marker = cornerMarkers[draggingCornerIndex];
        const projected = marker.position.clone().project(camera);
        const originalZ = projected.z;
        const ndcX = (screenX / window.innerWidth) * 2 - 1;
        const ndcY = -(screenY / window.innerHeight) * 2 + 1;
        const newPosition = new THREE.Vector3(ndcX, ndcY, originalZ).unproject(camera);
        marker.position.copy(newPosition);
        if (currentShape === 'sphere') {
            const avgRadius = cornerMarkers.reduce((sum, m) => sum + m.position.length(), 0) / cornerMarkers.length;
            cornerMarkers.forEach(m => {
                const dir = m.position.clone().normalize();
                m.position.copy(dir.multiplyScalar(avgRadius));
            });
        } else if (currentShape === 'cylinder') {
            const bottomIdx = [0, 1, 2, 3];
            const topIdx = [4, 5, 6, 7];
            const bottomCenter = bottomIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / bottomIdx.length);
            const topCenter = topIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / topIdx.length);
            bottomIdx.forEach(i => cornerMarkers[i].position.y = bottomCenter.y);
            topIdx.forEach(i => cornerMarkers[i].position.y = topCenter.y);
            const rb = bottomIdx.reduce((sum, i) => sum + cornerMarkers[i].position.clone().sub(bottomCenter).setY(0).length(), 0) / bottomIdx.length;
            const rt = topIdx.reduce((sum, i) => sum + cornerMarkers[i].position.clone().sub(topCenter).setY(0).length(), 0) / topIdx.length;
            function reprojectRing(ids, center, r) {
                ids.forEach(i => {
                    const v = cornerMarkers[i].position.clone().sub(center);
                    const angle = Math.atan2(v.z, v.x);
                    cornerMarkers[i].position.x = center.x + Math.cos(angle) * r;
                    cornerMarkers[i].position.z = center.z + Math.sin(angle) * r;
                });
            }
            reprojectRing(bottomIdx, bottomCenter, rb);
            reprojectRing(topIdx, topCenter, rt);
        } else if (currentShape === 'cone') {
            const baseIdx = [0, 1, 2, 3];
            const apexIdx = 4;
            const baseCenter = baseIdx.reduce((acc, i) => acc.add(cornerMarkers[i].position), new THREE.Vector3()).multiplyScalar(1 / baseIdx.length);
            baseIdx.forEach(i => cornerMarkers[i].position.y = baseCenter.y);
            const r = baseIdx.reduce((sum, i) => sum + cornerMarkers[i].position.clone().sub(baseCenter).setY(0).length(), 0) / baseIdx.length;
            baseIdx.forEach(i => {
                const v = cornerMarkers[i].position.clone().sub(baseCenter);
                const angle = Math.atan2(v.z, v.x);
                cornerMarkers[i].position.x = baseCenter.x + Math.cos(angle) * r;
                cornerMarkers[i].position.z = baseCenter.z + Math.sin(angle) * r;
            });
            const apex = cornerMarkers[apexIdx].position;
            apex.x = baseCenter.x;
            apex.z = baseCenter.z;
        }
        createCube();
    }

    if (hoveringIndex === -1) {
        const ndcX = (screenX / window.innerWidth) * 2 - 1;
        const ndcY = -(screenY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        const intersects = raycaster.intersectObjects(placedGroups.flatMap(g => g.children), true);
        if (isCurrentlyPinching) {
            if (!draggingGroup && intersects.length > 0) {
                draggingGroup = intersects[0].object.parent;
            }
            if (draggingGroup) {
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion), 0);
                const point = new THREE.Vector3();
                raycaster.ray.intersectPlane(plane, point);
                draggingGroup.position.copy(point);

                const bin = document.getElementById('bin-drop');
                const binRect = bin.getBoundingClientRect();
                const groupScreen = draggingGroup.position.clone().project(camera);
                const gx = (groupScreen.x + 1) / 2 * window.innerWidth;
                const gy = (1 - groupScreen.y) / 2 * window.innerHeight;
                const overBin = gx >= binRect.left && gx <= binRect.right && gy >= binRect.top && gy <= binRect.bottom;
                bin.classList.toggle('active', overBin);

                if (overBin) {
                    if (binHoverStartMs === null) {
                        binHoverStartMs = Date.now();
                    } else if (Date.now() - binHoverStartMs >= 3000) {
                        scene.remove(draggingGroup);
                        placedGroups = placedGroups.filter(g => g !== draggingGroup);
                        draggingGroup = null;
                        binHoverStartMs = null;
                        bin.classList.remove('active');
                        const ring = document.getElementById('bin-progress');
                        if (ring) ring.style.strokeDashoffset = `${2 * Math.PI * 26}`;
                    }
                    const ring = document.getElementById('bin-progress');
                    if (ring) {
                        const circumference = 2 * Math.PI * 26;
                        const elapsed = Math.min(BIN_DELETE_MS, Date.now() - binHoverStartMs);
                        const progress = elapsed / BIN_DELETE_MS;
                        ring.style.strokeDashoffset = `${circumference * (1 - progress)}`;
                    }
                } else {
                    binHoverStartMs = null;
                    const ring = document.getElementById('bin-progress');
                    if (ring) {
                        ring.style.strokeDashoffset = `${2 * Math.PI * 26}`;
                    }
                }
            }
        } else {
            draggingGroup = null;
            document.getElementById('bin-drop').classList.remove('active');
            binHoverStartMs = null;
            const ring = document.getElementById('bin-progress');
            if (ring) ring.style.strokeDashoffset = `${2 * Math.PI * 26}`;
        }
    }

    if (!isCurrentlyPinching && isPinching && draggingCornerIndex !== -1) {
        saveState(); 
        draggingCornerIndex = -1;
    }

    isPinching = isCurrentlyPinching;

    if (!isCurrentlyPinching && draggingGroup) {
        const bin = document.getElementById('bin-drop');
        bin.classList.remove('active');
        draggingGroup = null;
        binHoverStartMs = null;
        const ring = document.getElementById('bin-progress');
        if (ring) ring.style.strokeDashoffset = `${2 * Math.PI * 26}`;
    }
}

function isFist(landmarks) {
    const fingers = [
        [8, 6],
        [12, 10],
        [16, 14],
        [20, 18]
    ];
    return fingers.every(([tip, pip]) => landmarks[tip].y > landmarks[pip].y);
}

function drawLandmarks(hands) {
    hands.forEach(landmarks => {
        for (const landmark of landmarks) {
            const x = landmark.x * canvasElement.width;
            const y = landmark.y * canvasElement.height;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
            canvasCtx.fillStyle = 'cyan';
            canvasCtx.fill();
        }
    });
}

async function initWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user'
        }
    });
    videoElement.srcObject = stream;
    return new Promise(resolve => videoElement.onloadedmetadata = () => resolve());
}

async function main() {
    await initWebcam();
    initThree();
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    drawColorPickerWheel();
    updateUndoRedoButtons();

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });
    hands.onResults((results) => {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        const handsLandmarks = results.multiHandLandmarks;

        if (!handsLandmarks || handsLandmarks.length === 0) {
            draggingCornerIndex = -1;
            previousLeftFistX = null;
            isIndexFingerDown = false;
            clearHighlights();
            cornerMarkers.forEach(marker => marker.material.color.set(marker.userData.originalColor));
            return;
        }

        drawLandmarks(handsLandmarks);

        let rightHand = null,
            leftHand = null;
        if (results.multiHandedness.length === 2) {
            results.multiHandedness.forEach((handedness, i) => {
                if (handedness.label === 'Right') leftHand = handsLandmarks[i];
                else rightHand = handsLandmarks[i];
            });
        } else if (results.multiHandedness.length === 1) {
            if (results.multiHandedness[0].label === 'Right') leftHand = handsLandmarks[0];
            else rightHand = handsLandmarks[0];
        }

        if (rightHand) {
            detectDrag(rightHand);
        } else {
            draggingCornerIndex = -1;
            isIndexFingerDown = false;
            clearHighlights();
            cornerMarkers.forEach(marker => marker.material.color.set(marker.userData.originalColor));
        }

        if (leftHand && isFist(leftHand)) {
            isLeftFist = true;
            const x = (1 - leftHand[9].x) * window.innerWidth;
            const y = leftHand[9].y * window.innerHeight;

            if (previousLeftFistX !== null && previousLeftFistY !== null) {
                const deltaX = x - previousLeftFistX;
                const deltaY = y - previousLeftFistY;
                const radius = camera.position.length();

                const theta = Math.atan2(camera.position.x, camera.position.z) + deltaX * -0.005;
                const phi = Math.atan2(camera.position.y, Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2)) - deltaY * -0.005;

                const clampedPhi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi));

                camera.position.x = radius * Math.sin(theta) * Math.cos(clampedPhi);
                camera.position.z = radius * Math.cos(theta) * Math.cos(clampedPhi);
                camera.position.y = radius * Math.sin(clampedPhi);
                camera.lookAt(0, 0, 0);
            }

            previousLeftFistX = x;
            previousLeftFistY = y;
        } else {
            isLeftFist = false;
            previousLeftFistX = null;
            previousLeftFistY = null;
        }
    });

    const cam = new Camera(videoElement, {
        onFrame: async () => await hands.send({
            image: videoElement
        }),
        width: 1280,
        height: 960,
    });
    cam.start();
}

main();