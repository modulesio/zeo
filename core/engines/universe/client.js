import {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,
  NUM_CELLS,

  FOREGROUND_WIDTH,
  FOREGROUND_HEIGHT,
  FOREGROUND_WORLD_WIDTH,
  FOREGROUND_WORLD_HEIGHT,
  FOREGROUND_WORLD_DEPTH,
} from './lib/constants/universe';
import menuUtils from './lib/utils/menu';
import mapUtilsMaker from './lib/utils/map-utils';
import universeRenderer from './lib/render/universe';

import indev from 'indev';
// import Kruskal from 'kruskal';

const SIDES = ['left', 'right'];

class Universe {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {metadata} = archae;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return archae.requestPlugins([
      '/core/engines/three',
      '/core/engines/biolumi',
      '/core/engines/rend',
      '/core/plugins/random-utils',
    ]).then(([
      three,
      biolumi,
      rend,
      randomUtils,
    ]) => {
      if (live) {
        const {THREE, scene, camera} = three;
        const {alea} = randomUtils;

        const transparentMaterial = biolumi.getTransparentMaterial();
        const solidMaterial = biolumi.getSolidMaterial();

        const _decomposeObjectMatrixWorld = object => {
          const position = new THREE.Vector3();
          const rotation = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          object.matrixWorld.decompose(position, rotation, scale);
          return {position, rotation, scale};
        };

        const _requestUis = () => Promise.all([
          biolumi.requestUi({
            width: WIDTH,
            height: HEIGHT,
          }),
          biolumi.requestUi({
            width: FOREGROUND_WIDTH,
            height: FOREGROUND_HEIGHT,
          }),
        ])
          .then(([
            backgroundUi,
            foregroundUi,
          ]) => ({
            backgroundUi,
            foregroundUi,
          }));

        return _requestUis()
          .then(({
            backgroundUi,
            foregroundUi,
          }) => {
            if (live) {
              const rng = new alea('');
              const mapUtils = mapUtilsMaker.makeUtils({rng});

              const _renderMapChunk = mapChunk => {
                const {points} = mapChunk;

                const canvas = document.createElement('canvas');
                canvas.width = NUM_CELLS;
                canvas.height = NUM_CELLS;
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const {data: imageDataData} = imageData;
                for (let y = 0; y < NUM_CELLS; y++) {
                  for (let x = 0; x < NUM_CELLS; x++) {
                    const baseIndex = mapUtils.getCoordIndex(x, y);
                    const baseImageDataIndex = baseIndex * 4;

                    const point = points[baseIndex];
                    const {biome} = point;
                    const colorHex = mapUtils.getBiomeColor(biome);
                    const color = new THREE.Color(colorHex);
                    imageDataData[baseImageDataIndex + 0] = color.r * 255;
                    imageDataData[baseImageDataIndex + 1] = color.g * 255;
                    imageDataData[baseImageDataIndex + 2] = color.b * 255;
                    imageDataData[baseImageDataIndex + 3] = 255;
                  }
                }
                ctx.putImageData(imageData, 0, 0);

                return canvas.toDataURL('image/png');
              };

              const mapState = {
                mapChunks: [
                  mapUtils.makeMapChunk({
                    position: new THREE.Vector2(0, 0),
                  }),
                ],
              };
              const _makeWorldsState = () => {
                const generator = indev({
                  random: rng,
                });
                const mapNoise = generator.simplex({
                  frequency: 0.05,
                  octaves: 4,
                });
                const worldNoise = generator.simplex({
                  frequency: 0.05,
                  octaves: 4,
                });

                class World {
                  constructor(worldName, point) {
                    this.worldName = worldName;
                    this.point = point;
                  }
                }

                const worlds = (() => {
                  const numPoints = 10;
                  const heightScale = 0.2;
                  const heightOffset = (0.005 * 12) / 2;

                  const result = Array(numPoints);
                  for (let i = 0; i < numPoints; i++) {
                    const x = rng();
                    const y = rng();
                    const point = new THREE.Vector2(
                      rng() * NUM_CELLS,
                      rng() * NUM_CELLS
                    );
                    const world = new World('world' + _pad(i, 2), point);
                    result[i] = world;
                  }
                  return result;
                })();

                return {
                  worlds,
                };
              };
              const worldsState = _makeWorldsState();

              const backgroundImageState = {
                mapChunks: mapState.mapChunks.map(_renderMapChunk),
              };
              const foregroundImageState = {
                mapChunks: mapState.mapChunks.map(_renderMapChunk),
              };

              backgroundUi.pushPage(({backgroundImage}) => ([
                {
                  type: 'html',
                  src: universeRenderer.getBackgroundImageSrc(backgroundImage),
                  x: 0,
                  y: 0,
                  w: WIDTH,
                  h: HEIGHT,
                  scroll: true,
                  pixelated: true,
                },
              ]), {
                type: 'background',
                state: {
                  backgroundImage: backgroundImageState,
                },
                immediate: true,
              });
              foregroundUi.pushPage(({foregroundImage}) => ([
                {
                  type: 'html',
                  src: universeRenderer.getForegroundImageSrc(foregroundImage),
                  x: 0,
                  y: 0,
                  w: FOREGROUND_WIDTH,
                  h: FOREGROUND_HEIGHT,
                  scroll: true,
                },
              ]), {
                type: 'foreground',
                state: {
                  foregroundImage: foregroundImageState,
                },
                immediate: true,
              });

              const menuMesh = (() => {
                const object = new THREE.Object3D();
                object.position.z = -1;
                object.visible = false;

                const backgroundMesh = (() => {
                  const width = WORLD_WIDTH;
                  const height = WORLD_HEIGHT;
                  const depth = WORLD_DEPTH;

                  const menuMaterial = biolumi.makeMenuMaterial();

                  const geometry = new THREE.PlaneBufferGeometry(width, height);
                  const materials = [solidMaterial, menuMaterial];

                  const mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, materials);
                  mesh.receiveShadow = true;
                  mesh.menuMaterial = menuMaterial;

                  const shadowMesh = (() => {
                    const geometry = new THREE.BoxBufferGeometry(width, height, 0.01);
                    const material = transparentMaterial;
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.castShadow = true;
                    return mesh;
                  })();
                  mesh.add(shadowMesh);

                  return mesh;
                })();
                object.add(backgroundMesh);
                object.backgroundMesh = backgroundMesh;

                const foregroundMesh = (() => {
                  const width = FOREGROUND_WORLD_WIDTH;
                  const height = FOREGROUND_WORLD_HEIGHT;
                  const depth = FOREGROUND_WORLD_DEPTH;

                  const menuMaterial = biolumi.makeMenuMaterial({
                    color: [1, 1, 1, 0],
                  });

                  const geometry = new THREE.PlaneBufferGeometry(width, height);
                  const material = menuMaterial;

                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.position.z = 0.01;
                  mesh.receiveShadow = true;
                  mesh.menuMaterial = menuMaterial;

                  return mesh;
                })();
                object.add(foregroundMesh);
                object.foregroundMesh = foregroundMesh;

                return object;
              })();
              rend.addMenuMesh('universeMesh', menuMesh);

              const _updatePages = menuUtils.debounce(next => {
                const backgroundPages = backgroundUi.getPages();
                const foregroundPages = foregroundUi.getPages()
                const pages = backgroundPages.concat(foregroundPages);

                if (pages.length > 0) {
                  let pending = pages.length;
                  const pend = () => {
                    if (--pending === 0) {
                      next();
                    }
                  };

                  for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    const {type} = page;

                    if (type === 'background') {
                      page.update({
                        backgroundImage: backgroundImageState,
                      }, pend);
                    } else if (type === 'foreground') {
                      page.update({
                        foregroundImage: foregroundImageState,
                      }, pend);
                    } else {
                      pend();
                    }
                  }
                } else {
                  next();
                }
              });

              const _update = () => {
                const _updateTextures = () => {
                  const tab = rend.getTab();

                  if (tab === 'worlds') {
                    const {
                      backgroundMesh: {
                        menuMaterial: backgroundMenuMaterial,
                      },
                      foregroundMesh: {
                        menuMaterial: foregroundMenuMaterial,
                      },
                    } = menuMesh;
                    const uiTime = rend.getUiTime();

                    biolumi.updateMenuMaterial({
                      ui: backgroundUi,
                      menuMaterial: backgroundMenuMaterial,
                      uiTime,
                    });
                    biolumi.updateMenuMaterial({
                      ui: foregroundUi,
                      menuMaterial: foregroundMenuMaterial,
                      uiTime,
                    });
                  }
                };

                _updateTextures();
              };
              rend.on('update', _update);

              this._cleanup = () => {
                rend.removeMenuMesh('universeMesh');

                rend.removeListener('update', _update);
              };
            }
          });
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

const _pad = (n, width) => {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
};

module.exports = Universe;
