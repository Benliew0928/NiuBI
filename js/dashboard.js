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
    let rotZ = 45, rotX = 60, zoom = 1;

    function applyScene() {
        roomSceneEl.style.transform = `rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale3d(${zoom},${zoom},${zoom})`;
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
        roomFloorEl.className = 'room-floor';
        let html = '<div class="room-wall-left"></div><div class="room-wall-back"></div>';

        const typeCount = {};
        room.devices.forEach((d, idx) => {
            typeCount[d.type] = (typeCount[d.type] || 0);
            const p = getPos(currentRoomId, d.type, idx);
            const off = typeCount[d.type] * 50;
            const x = p.x + off, y = p.y + off;
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
                data-id="${d.id}" style="--x:${x};--y:${y};">
                ${inner}
                <div class="device-label">${d.name}</div>
            </div>`;
        });

        roomFloorEl.innerHTML = html;

        roomFloorEl.querySelectorAll('.device-node[data-id]').forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedDeviceId = node.dataset.id;
                roomFloorEl.querySelectorAll('.device-node').forEach(n => n.classList.remove('selected'));
                node.classList.add('selected');
                updatePanel(room.devices.find(d => d.id === selectedDeviceId));
            });
        });
        roomFloorEl.addEventListener('click', () => {
            selectedDeviceId = null;
            roomFloorEl.querySelectorAll('.device-node').forEach(n => n.classList.remove('selected'));
            updatePanel(null);
        });
    }

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

    renderRoomsSidebar();
    renderRoomView();
});
