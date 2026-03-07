document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const houseId = urlParams.get('house') || 'modern-villa';

    await SmartHome.load();
    const house = SmartHome.getHouseById(houseId);
    if (!house) { document.getElementById('dh-house-title').textContent = "House Not Found"; return; }

    document.getElementById('dh-house-title').textContent = house.name;
    let currentRoomId = house.rooms.length > 0 ? house.rooms[0].id : null;
    let selectedDeviceId = null;

    const roomListEl = document.getElementById('room-list');
    const roomFloorEl = document.getElementById('room-floor');
    const roomSceneEl = document.getElementById('room-scene');
    const panelEmpty = document.getElementById('panel-empty');
    const panelContent = document.getElementById('panel-content');
    const pIcon = document.getElementById('panel-device-icon');
    const pName = document.getElementById('panel-device-name');
    const pStatus = document.getElementById('panel-device-status');
    const pPower = document.getElementById('device-power-toggle');
    const pValueGroup = document.getElementById('value-control-group');
    const pValueLabel = document.getElementById('value-label');
    const pValueSlider = document.getElementById('device-value-slider');
    const pValueDisplay = document.getElementById('device-value-display');

    // ===== Scene Rotation & Zoom with Long-Press =====
    let rotZ = 45, rotX = 60;
    let zoom = window.innerWidth <= 480 ? 0.45 : (window.innerWidth <= 768 ? 0.6 : 1);

    function applyScene() {
        roomSceneEl.style.transform = `rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale3d(${zoom},${zoom},${zoom})`;
        roomSceneEl.style.setProperty('--rot-x', `${rotX}deg`);
        roomSceneEl.style.setProperty('--rot-z', `${rotZ}deg`);
    }

    function setupLongPress(id, action) {
        const btn = document.getElementById(id);
        let timer = null;
        const start = () => { action(); timer = setInterval(action, 80); };
        const stop = () => { clearInterval(timer); timer = null; };
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
        btn.addEventListener('touchend', stop);
    }

    setupLongPress('btn-rotate-left', () => { rotZ -= 5; applyScene(); });
    setupLongPress('btn-rotate-right', () => { rotZ += 5; applyScene(); });
    setupLongPress('btn-zoom-in', () => { zoom = Math.min(zoom + 0.04, 1.8); applyScene(); });
    setupLongPress('btn-zoom-out', () => { zoom = Math.max(zoom - 0.04, 0.4); applyScene(); });
    applyScene();

    // ===== Mouse Drag Rotation =====
    const roomContainer = document.querySelector('.room-view-container');
    let isDragging = false;
    let startX = 0;

    roomContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.device-node') || e.target.closest('.scene-controls') || e.target.closest('#dh-panel')) return;
        isDragging = true;
        startX = e.clientX;
        roomContainer.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        rotZ += dx * 0.4;
        startX = e.clientX;
        applyScene();
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            roomContainer.style.cursor = 'grab';
        }
    });
    roomContainer.style.cursor = 'grab';

    // ===== 2D to 3D Projection Math =====
    // Solves the inverse matrix of rotateX(rotX) rotateZ(rotZ) scale3d(zoom)
    function getFloorDelta(dx, dy) {
        const radZ = rotZ * Math.PI / 180;
        const radX = rotX * Math.PI / 180;
        const cZ = Math.cos(radZ), sZ = Math.sin(radZ), cX = Math.cos(radX);
        // Protect against divide by zero if looking exactly top-down
        const cX_safe = Math.max(0.01, Math.abs(cX)) * Math.sign(cX || 1);

        const localX = (dx * cZ + dy * sZ / cX_safe) / zoom;
        const localY = (-dx * sZ + dy * cZ / cX_safe) / zoom;
        return { x: localX, y: localY };
    }

    // ===== Floor Resizing & Dragging Logic =====
    let resizeMode = null; // 'x' or 'y'
    let startFloorW = 0, startFloorD = 0;
    let draggingDeviceId = null;
    let initialPosX = 0, initialPosY = 0;

    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('#resize-x')) resizeMode = 'x';
        else if (e.target.closest('#resize-y')) resizeMode = 'y';
        else return;

        const room = house.rooms.find(r => r.id === currentRoomId);
        startFloorW = room.floorWidth || 420;
        startFloorD = room.floorDepth || 420;
        startX = e.clientX;
        startY = e.clientY;
        document.body.style.cursor = resizeMode === 'x' ? 'ew-resize' : 'ns-resize';
        e.preventDefault();
        e.stopPropagation();
    });

    let startY = 0;

    document.addEventListener('mousemove', (e) => {
        if (resizeMode) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const localDelta = getFloorDelta(dx, dy);
            const room = house.rooms.find(r => r.id === currentRoomId);

            let minW = 200, minD = 200;
            room.devices.forEach(d => {
                const p = d.pos;
                minW = Math.max(minW, (p.x || 0) + 100);
                minD = Math.max(minD, (p.y || 0) + 100);
            });

            if (resizeMode === 'x') {
                room.floorWidth = Math.max(minW, startFloorW + localDelta.x);
            } else {
                room.floorDepth = Math.max(minD, startFloorD + localDelta.y);
            }

            applyScene();
            roomSceneEl.style.setProperty('--floor-width', room.floorWidth);
            roomSceneEl.style.setProperty('--floor-depth', room.floorDepth);
            return;
        }

        if (draggingDeviceId) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const localDelta = getFloorDelta(dx, dy);
            const room = house.rooms.find(r => r.id === currentRoomId);
            const d = room.devices.find(dev => dev.id === draggingDeviceId);

            // Constrain device strictly inside the floor bounds
            let newX = initialPosX + localDelta.x;
            let newY = initialPosY + localDelta.y;
            newX = Math.max(0, Math.min(newX, (room.floorWidth || 420) - 60));
            newY = Math.max(0, Math.min(newY, (room.floorDepth || 420) - 60));

            // Collision Detection processing
            let collision = false;
            room.devices.forEach(otherDev => {
                if (otherDev.id === draggingDeviceId) return;
                const ox = otherDev.pos.x, oy = otherDev.pos.y;
                if (Math.abs(newX - ox) < 45 && Math.abs(newY - oy) < 45) {
                    collision = true;
                }
            });

            const node = document.querySelector(`.device-node[data-id="${draggingDeviceId}"]`);
            if (node) {
                if (collision) {
                    node.classList.add('collision-error');
                    // Do not update real position, just visual
                    node.style.setProperty('--x', newX);
                    node.style.setProperty('--y', newY);
                } else {
                    node.classList.remove('collision-error');
                    d.pos.x = newX;
                    d.pos.y = newY;
                    node.style.setProperty('--x', newX);
                    node.style.setProperty('--y', newY);
                }
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (resizeMode) {
            resizeMode = null;
            document.body.style.cursor = '';
            renderRoomView();
        }
        if (draggingDeviceId) {
            const node = document.querySelector(`.device-node[data-id="${draggingDeviceId}"]`);
            if (node && node.classList.contains('collision-error')) {
                // Revert visual overlapping position back to last known good saved position
                const room = house.rooms.find(r => r.id === currentRoomId);
                const d = room.devices.find(dev => dev.id === draggingDeviceId);
                node.style.setProperty('--x', d.pos.x);
                node.style.setProperty('--y', d.pos.y);
                node.classList.remove('collision-error');
            }
            draggingDeviceId = null;
            document.body.style.cursor = '';
        }
    });

    // ===== Device Positions =====
    const posMap = {
        'living-room': { tv: { x: 200, y: 50 }, ac: { x: 50, y: 180 }, light: { x: 320, y: 320 }, speaker: { x: 280, y: 180 } },
        'studio-living': { tv: { x: 200, y: 50 }, light: { x: 300, y: 300 } },
        'kitchen': { appliance: { x: 80, y: 100 }, light: { x: 280, y: 280 } },
        'bedroom-master': { ac: { x: 50, y: 150 }, light: { x: 300, y: 300 }, curtain: { x: 200, y: 40 } },
        'den': { ac: { x: 200, y: 80 } }
    };

    function getPos(roomId, type, idx) {
        const m = posMap[roomId];
        if (m && m[type]) return m[type];
        return { x: 80 + (idx % 3) * 130, y: 80 + Math.floor(idx / 3) * 130 };
    }

    // ===== Cube helper: generates 6 visible faces =====
    function cube(cw, cd, ch, baseCls, extraFrontCls = '') {
        return `<div class="cube ${baseCls}" style="--cw:${cw};--cd:${cd};--ch:${ch};">
            <div class="face face-top"></div>
            <div class="face face-bottom"></div>
            <div class="face face-front ${extraFrontCls}"></div>
            <div class="face face-back"></div>
            <div class="face face-left"></div>
            <div class="face face-right"></div>
        </div>`;
    }

    function deco(x, y, z, cw, cd, ch, cls) {
        return `<div class="room-deco" style="transform:translate3d(${x}px, ${y}px, ${z}px);">
            ${cube(cw, cd, ch, cls)}
        </div>`;
    }

    function renderDecorations(roomId) {
        let decs = '';
        if (roomId === 'living-room') {
            decs += deco(100, 150, 0, 120, 60, 30, 'deco-sofa');
            decs += deco(120, 220, 0, 80, 40, 15, 'deco-table');
            decs += deco(280, 0, 40, 80, 8, 100, 'deco-window');
            decs += deco(0, 100, 0, 8, 80, 150, 'deco-door');
            decs += deco(80, 130, 0, 160, 160, 2, 'deco-rug');
        } else if (roomId === 'kitchen') {
            decs += deco(150, 100, 0, 200, 60, 45, 'deco-counter');
            decs += deco(0, 150, 0, 60, 200, 45, 'deco-counter');
            decs += deco(0, 250, 0, 8, 80, 150, 'deco-door');
            decs += deco(180, 100, 120, 140, 30, 60, 'deco-cabinet');
        } else if (roomId === 'bedroom-master') {
            decs += deco(100, 0, 0, 140, 180, 25, 'deco-bed');
            decs += deco(120, 0, 25, 100, 10, 40, 'deco-headboard');
            decs += deco(50, 0, 0, 40, 40, 30, 'deco-nightstand');
            decs += deco(250, 0, 0, 40, 40, 30, 'deco-nightstand');
            decs += deco(380, 200, 0, 20, 150, 180, 'deco-wardrobe');
            decs += deco(0, 100, 0, 8, 80, 150, 'deco-door');
            decs += deco(200, 392, 40, 100, 8, 100, 'deco-window');
        } else if (roomId === 'studio-living') {
            decs += deco(100, 150, 0, 120, 60, 30, 'deco-sofa');
            decs += deco(0, 0, 40, 8, 150, 120, 'deco-window');
        } else if (roomId === 'den') {
            decs += deco(150, 150, 0, 80, 80, 40, 'deco-chair');
            decs += deco(280, 0, 0, 100, 40, 120, 'deco-bookshelf');
        }
        return decs;
    }

    function renderRoomsSidebar() {
        roomListEl.innerHTML = house.rooms.map(r => `
            <li class="room-item ${r.id === currentRoomId ? 'active' : ''}" data-id="${r.id}">
                <i class="ph ph-door"></i> ${r.name}
                <span class="room-device-count">${r.devices.length}</span>
            </li>`).join('');
        roomListEl.querySelectorAll('.room-item').forEach(el => {
            el.addEventListener('click', () => {
                currentRoomId = el.dataset.id;
                selectedDeviceId = null;
                updatePanel(null);
                renderRoomsSidebar();
                renderRoomView();
            });
        });
    }

    function renderRoomView() {
        const room = house.rooms.find(r => r.id === currentRoomId);
        if (!room) return;

        room.floorWidth = room.floorWidth || 420;
        room.floorDepth = room.floorDepth || 420;
        roomSceneEl.style.setProperty('--floor-width', room.floorWidth);
        roomSceneEl.style.setProperty('--floor-depth', room.floorDepth);

        roomFloorEl.className = 'room-floor';
        let html = '<div class="room-wall-left"></div><div class="room-wall-back"></div>';
        html += '<div class="resize-handle resize-x" id="resize-x" title="Drag to resize floor width"></div>';
        html += '<div class="resize-handle resize-y" id="resize-y" title="Drag to resize floor depth"></div>';
        html += renderDecorations(currentRoomId);

        const typeCount = {};
        room.devices.forEach((d, idx) => {
            typeCount[d.type] = (typeCount[d.type] || 0);

            // Generate or fetch permanent position
            if (!d.pos) {
                const p = getPos(currentRoomId, d.type, idx);
                const off = typeCount[d.type] * 50;
                d.pos = { x: p.x + off, y: p.y + off };
            }

            const x = d.pos.x, y = d.pos.y;
            typeCount[d.type]++;
            const isOn = d.status === 'on';
            const sel = d.id === selectedDeviceId ? 'selected' : '';
            let inner = '';

            if (d.type === 'tv') {
                // Stand base
                inner += `<div class="sub-cube" style="transform:translate3d(-25px,-10px,0px);">
                    ${cube(50, 20, 4, 'cube-tv-stand')}</div>`;
                // Stand neck
                inner += `<div class="sub-cube" style="transform:translate3d(-4px,-4px,4px);">
                    ${cube(8, 8, 20, 'cube-tv-stand')}</div>`;
                // Screen
                inner += `<div class="sub-cube" style="transform:translate3d(-50px,-4px,24px);">
                    ${cube(100, 8, 60, 'cube-tv-body', 'tv-screen-front')}</div>`;
            } else if (d.type === 'ac') {
                // AC wall mounted (x=wall, running along y axis)
                inner += `<div class="sub-cube" style="transform:translate3d(-20px,-40px,0px);">
                    ${cube(20, 80, 25, 'cube-ac-body', 'ac-vent-front')}</div>`;
            } else if (d.type === 'light') {
                // Lamp base
                inner += `<div class="sub-cube" style="transform:translate3d(-15px,-15px,0px);">
                    ${cube(30, 30, 6, 'cube-lamp-base')}</div>`;
                // Pole
                inner += `<div class="sub-cube" style="transform:translate3d(-2px,-2px,6px);">
                    ${cube(4, 4, 60, 'cube-lamp-pole')}</div>`;
                // Shade
                inner += `<div class="sub-cube" style="transform:translate3d(-20px,-20px,66px);">
                    ${cube(40, 40, 25, 'cube-lamp-shade')}</div>`;
            } else {
                // Generic
                inner += `<div class="sub-cube" style="transform:translate3d(-20px,-20px,0px);">
                    ${cube(40, 40, 40, 'cube-generic')}</div>`;
            }

            html += `<div class="device-node device-${d.type === 'light' ? 'lamp' : d.type} ${isOn ? 'on' : 'off'} ${sel}"
                data-id="${d.id}" style="--x:${x};--y:${y}; --r:${d.rot || 0};">
                <div class="device-rotator" style="transform: rotateZ(calc(var(--r, 0) * 1deg)); transform-style: preserve-3d;">
                    ${inner}
                </div>
                <div class="device-label">${d.name}</div>
            </div>`;
        });

        roomFloorEl.innerHTML = html;

        roomFloorEl.querySelectorAll('.device-node[data-id]').forEach(node => {
            node.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Stop scene rotation processing
                e.preventDefault(); // Stop text selection

                selectedDeviceId = node.dataset.id;
                roomFloorEl.querySelectorAll('.device-node').forEach(n => n.classList.remove('selected'));
                node.classList.add('selected');
                updatePanel(room.devices.find(d => d.id === selectedDeviceId));

                // Start Drag
                draggingDeviceId = selectedDeviceId;
                const dev = room.devices.find(d => d.id === selectedDeviceId);
                initialPosX = dev.pos.x;
                initialPosY = dev.pos.y;
                startX = e.clientX;
                startY = e.clientY;
                document.body.style.cursor = 'move';
            });
            node.addEventListener('click', (e) => { e.stopPropagation(); });
        });
        roomFloorEl.addEventListener('click', () => {
            selectedDeviceId = null;
            roomFloorEl.querySelectorAll('.device-node').forEach(n => n.classList.remove('selected'));
            updatePanel(null);
        });
    }

    // ===== Device Spawner Toolbar =====
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const room = house.rooms.find(r => r.id === currentRoomId);
            if (!room) return;

            const newDev = {
                id: 'custom-' + Date.now(),
                name: 'New ' + capitalize(type === 'light' ? 'lamp' : type),
                type: type,
                status: 'off',
                pos: { x: (room.floorWidth || 420) / 2 - 20, y: (room.floorDepth || 420) / 2 - 20 }
            };
            if (type === 'ac') { newDev.value = 24; newDev.metric = '°C'; }
            if (type === 'tv' || type === 'speaker') { newDev.value = 50; newDev.metric = '%'; }

            room.devices.push(newDev);
            selectedDeviceId = newDev.id;
            renderRoomView();
            updatePanel(newDev);
        });
    });

    function updatePanel(device) {
        if (!device) { panelEmpty.style.display = 'flex'; panelContent.style.display = 'none'; return; }
        panelEmpty.style.display = 'none';
        panelContent.style.display = 'block';
        pIcon.className = 'ph ' + device.icon;
        pName.textContent = device.name;
        const isOn = device.status === 'on';
        pStatus.textContent = isOn ? 'Active' : 'Offline';
        pStatus.className = 'status-badge ' + (isOn ? 'active' : 'offline');
        pPower.checked = isOn;
        if (device.value !== undefined) {
            pValueGroup.style.display = 'block';
            let label = 'Intensity';
            if (device.type === 'ac') label = 'Temperature';
            if (device.type === 'tv' || device.type === 'speaker') label = 'Volume';
            pValueLabel.textContent = label;
            pValueSlider.min = device.type === 'ac' ? 16 : 0;
            pValueSlider.max = device.type === 'ac' ? 30 : 100;
            pValueSlider.value = device.value;
            pValueDisplay.textContent = device.value + device.metric;
        } else { pValueGroup.style.display = 'none'; }
    }

    pPower.addEventListener('change', () => {
        if (!selectedDeviceId) return;
        const u = SmartHome.toggleDevice(houseId, currentRoomId, selectedDeviceId);
        if (u) { renderRoomView(); updatePanel(u); }
    });
    pValueSlider.addEventListener('input', (e) => {
        if (!selectedDeviceId) return;
        const d = house.rooms.find(r => r.id === currentRoomId).devices.find(d => d.id === selectedDeviceId);
        pValueDisplay.textContent = parseInt(e.target.value) + d.metric;
    });
    pValueSlider.addEventListener('change', (e) => {
        if (!selectedDeviceId) return;
        const u = SmartHome.updateDeviceValue(houseId, currentRoomId, selectedDeviceId, parseInt(e.target.value));
        if (u) { renderRoomView(); updatePanel(u); }
    });

    // ===== Action Buttons (Rotate & Delete) =====
    document.getElementById('btn-device-rotate').addEventListener('click', () => {
        if (!selectedDeviceId) return;
        const room = house.rooms.find(r => r.id === currentRoomId);
        const d = room.devices.find(dev => dev.id === selectedDeviceId);
        d.rot = ((d.rot || 0) + 90) % 360;

        const node = document.querySelector(`.device-node[data-id="${selectedDeviceId}"]`);
        if (node) node.style.setProperty('--r', d.rot);
    });

    document.getElementById('btn-device-delete').addEventListener('click', () => {
        if (!selectedDeviceId) return;

        const room = house.rooms.find(r => r.id === currentRoomId);
        room.devices = room.devices.filter(dev => dev.id !== selectedDeviceId);
        selectedDeviceId = null;
        renderRoomView();
        updatePanel(null);
    });

    renderRoomsSidebar();
    renderRoomView();
});
