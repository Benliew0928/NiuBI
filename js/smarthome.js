/**
 * NiuBi+ Smart Home Data Module
 * Manages loading house data, returning specific houses/rooms, and toggling device states.
 */
const SmartHome = (() => {
    let houses = [];

    // Fallback data in case fetch fails
    const INLINE_HOUSES = [
        {
            "id": "modern-villa",
            "name": "Modern Villa",
            "description": "4-bedroom luxury smart villa with full automation.",
            "image": "images/house-villa.png",
            "deviceCount": 16,
            "rooms": [
                {
                    "id": "living-room",
                    "name": "Living Room",
                    "devices": [
                        { "id": "tv-1", "name": "NiuBi+ Smart TV 85\"", "type": "tv", "status": "on", "icon": "ph-television", "value": 45, "metric": "Vol" },
                        { "id": "ac-1", "name": "Climate Control", "type": "ac", "status": "on", "icon": "ph-thermometer", "value": 22, "metric": "°C" },
                        { "id": "light-1", "name": "Ambient Lighting", "type": "light", "status": "off", "icon": "ph-lightbulb", "value": 0, "metric": "%" }
                    ]
                }
            ]
        }
    ];

    async function load() {
        if (houses.length > 0) return houses;
        try {
            const res = await fetch('data/houses.json');
            const data = await res.json();
            houses = data.houses;
        } catch (err) {
            console.warn('Fetch failed, using inline fallback data:', err.message);
            houses = INLINE_HOUSES;
        }
        return houses;
    }

    function getAllHouses() {
        return houses;
    }

    function getHouseById(id) {
        return houses.find(h => h.id === id);
    }

    function toggleDevice(houseId, roomId, deviceId) {
        let house = getHouseById(houseId);
        if (!house) return null;
        let room = house.rooms.find(r => r.id === roomId);
        if (!room) return null;
        let device = room.devices.find(d => d.id === deviceId);
        if (!device) return null;

        device.status = device.status === 'on' ? 'off' : 'on';
        if (device.status === 'on' && device.value === 0) {
            if (device.type === 'ac') device.value = 22;
            else if (device.type === 'light') device.value = 100;
            else if (device.type === 'tv' || device.type === 'speaker') device.value = 30;
        } else if (device.status === 'off') {
            // keep value for when it turns back on, or reset.
        }

        return device;
    }

    function updateDeviceValue(houseId, roomId, deviceId, newValue) {
        let house = getHouseById(houseId);
        if (!house) return null;
        let room = house.rooms.find(r => r.id === roomId);
        if (!room) return null;
        let device = room.devices.find(d => d.id === deviceId);
        if (!device) return null;

        device.value = newValue;
        if (newValue > 0 && device.status === 'off') device.status = 'on';
        if (newValue === 0 && device.status === 'on' && device.type !== 'ac') device.status = 'off';

        return device;
    }

    return { load, getAllHouses, getHouseById, toggleDevice, updateDeviceValue };
})();
