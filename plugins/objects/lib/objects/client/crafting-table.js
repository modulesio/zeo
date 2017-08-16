const HEIGHTFIELD_PLUGIN = 'plugins-heightfield';
const CRAFT_PLUGIN = 'plugins-craft';
const DEFAULT_MATRIX = [
  0, 0, 0,
  0, 0, 0, 1,
  1, 1, 1,
];

const dataSymbol = Symbol();

const craftingTable = objectApi => {
  const {three, elements, pose, input, render, items} = zeo;
  const {THREE, scene, camera, renderer} = three;

  const zeroQuaternion = new THREE.Quaternion();
  const oneVector = new THREE.Vector3(1, 1, 1);
  const localVector = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  const craftOffsetVector = new THREE.Vector3(0, 1, 0);

  const _requestImage = (src, name) => new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
    };
    img.onerror = err => {
      reject(img);
    };
    img.src = src;
    img.name = name;
  });

  const craftingTables = [];
  const _bindCrafter = (craftingTable, craftElement) => {
    craftingTable.crafter = craftElement.open(localVector.copy(craftingTable.position).add(craftOffsetVector), zeroQuaternion, oneVector);
  };
  const _unbindCrafter = (craftingTable, craftElement) => {
    craftElement.close(craftingTable.crafter);
    craftingTable.crafter = null;
  };

  const elementListener = elements.makeListener(CRAFT_PLUGIN);
  elementListener.on('add', entityElement => {
    for (let i = 0; i < craftingTables.length; i++) {
      const craftingTable = craftingTables[i];
     _bindCrafter(craftingTable, entityElement);
    }
  });
  elementListener.on('remove', () => {
    for (let i = 0; i < craftingTables.length; i++) {
      const craftingTable = craftingTables[i];
      _unbindCrafter(craftingTable, entityElement);
    }
  });

  return () => Promise.all([
    _requestImage('/archae/objects/img/crafting-table-top.png', 'craftingTableTop'),
    _requestImage('/archae/objects/img/crafting-table-front.png', 'craftingTableFront'),
    _requestImage('/archae/objects/img/crafting-table-side.png', 'craftingTableSide'),
  ])
    .then(craftingTableImgs => craftingTableImgs.map(craftingTableImg => objectApi.registerTexture(craftingTableImg.name, craftingTableImg)))
    .then(() => objectApi.registerGeometry('craftingTable', (args) => {
      const {THREE, getUv} = args;

      const geometry = new THREE.BoxBufferGeometry(1, 1, 1)
        .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0.5, 0));
      const uvs = geometry.getAttribute('uv').array;
      const numUvs = uvs.length / 2;
      for (let i = 0; i < numUvs; i++) {
        let textureName;
        if (
          i === 16 || i === 17 || i === 18 || i === 19 // front
        ) {
          textureName = 'craftingTableFront';
        } else if (
          i === 0 || i === 1 || i === 2 || i === 3 || // right
          i === 4 || i === 5 || i === 6 || i === 7 || // left
          i === 20 || i === 21 || i === 22 || i === 23 // back
        ) {
          textureName = 'craftingTableSide';
        } else if (
          i === 8 || i === 9 || i === 10 || i === 11 || // top
          i === 12 || i === 13 || i === 14 || i === 15 // bottom
        ) {
          textureName = 'craftingTableTop';
        } else {
          textureName = 'craftingTableFront';
        }

        const craftingTableUvs = getUv(textureName);
        const uvWidth = craftingTableUvs[2] - craftingTableUvs[0];
        const uvHeight = craftingTableUvs[3] - craftingTableUvs[1];
        uvs[i * 2 + 0] = craftingTableUvs[0] + (uvs[i * 2 + 0] * uvWidth);
        uvs[i * 2 + 1] = (craftingTableUvs[1] + uvHeight) - (uvs[i * 2 + 1] * uvHeight);
      }

      return geometry;
    }))
    .then(() => {
      const craftingTableItemApi = {
        asset: 'ITEM.CRAFTINGTABLE',
        itemAddedCallback(grabbable) {
          const _triggerdown = e => {
            const {side} = e;

            if (grabbable.getGrabberSide() === side) {
              localVector.set(
                grabbable.position.x,
                heightfieldElement ? heightfieldElement.getBestElevation(grabbable.position.x, grabbable.position.z, grabbable.position.y) : 0,
                grabbable.position.z
              );
              localEuler.setFromQuaternion(grabbable.rotation, camera.rotation.order);
              localEuler.x = 0;
              localEuler.z = 0;
              localQuaternion.setFromEuler(localEuler);
              objectApi.addObject('craftingTable', localVector, localQuaternion);

              items.destroyItem(grabbable);

              e.stopImmediatePropagation();
            }
          };
          input.on('triggerdown', _triggerdown);

          grabbable[dataSymbol] = {
            cleanup: () => {
              input.removeListener('triggerdown', _triggerdown);
            },
          };
        },
        itemRemovedCallback(grabbable) {
          const {[dataSymbol]: {cleanup}} = grabbable;
          cleanup();
        },
      };
      items.registerItem(this, craftingTableItemApi);

      const craftingTableObjectApi = {
        object: 'craftingTable',
        addedCallback(id, position) {
          const craftingTable = {
            id,
            position: position.clone(),
            crafter: null,
          };

          const craftElement = elements.getEntitiesElement().querySelector(CRAFT_PLUGIN);
          if (craftElement) {
            _bindCrafter(craftingTable, craftElement);
          }

          craftingTables[id] = craftingTable;
        },
        removedCallback(id) {
          const craftingTable = craftingTable;

          const craftElement = elements.getEntitiesElement().querySelector(CRAFT_PLUGIN);
          if (craftElement) {
            _unbindCrafter(craftingTable, craftElement);
          }

          craftingTables[id] = null;
        },
        triggerCallback(id, side) {
          const craftingTable = craftingTables[id];
          if (craftingTable.crafter) {
            craftingTable.crafter.craft();
          }
        },
        gripCallback(id, side) {
          const itemId = _makeId();
          const asset = 'ITEM.CRAFTINGTABLE';
          const assetInstance = items.makeItem({
            type: 'asset',
            id: itemId,
            name: asset,
            displayName: asset,
            attributes: {
              type: {value: 'asset'},
              value: {value: asset},
              position: {value: DEFAULT_MATRIX},
              quantity: {value: 1},
              owner: {value: null},
              bindOwner: {value: null},
              physics: {value: false},
            },
          });
          assetInstance.grab(side);

          objectApi.removeObject(x, z, objectIndex);
        },
      };
      objectApi.registerObject(craftingTableObjectApi);

      return () => {
        items.unregisterItem(this, craftingTableItemApi);
        objectApi.unregisterObject(craftingTableObjectApi);

        // XXX unregister texture/geometry
      };
    });
};
const _makeId = () => Math.random().toString(36).substring(7);

module.exports = craftingTable;
