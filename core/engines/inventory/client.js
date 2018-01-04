const EffectComposer = require('./lib/three-extra/postprocessing/EffectComposer');
const BlurShader = require('./lib/three-extra/shaders/BlurShader');
const htmlTagNames = require('html-tag-names');
const {
  WIDTH,
  HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  ITEM_MENU_SIZE,
  ITEM_MENU_INNER_SIZE,
  ITEM_MENU_BORDER_SIZE,
  ITEM_MENU_WORLD_SIZE,

  DEFAULT_USER_HEIGHT,
} = require('./lib/constants/menu');

const NUM_POSITIONS = 500 * 1024;
const MENU_RANGE = 4;
const SIDES = ['left', 'right'];

const width = 0.1;
const height = 0.1;
const pixelWidth = 128;
const pixelHeight = 128;
const numFilesPerPage = 10;
const numModsPerPage = 10;
const fontSize = 34;

const _normalizeType = ext => {
  if (ext === 'itm' || ext === 'pls') {
    return ext;
  } else if (
    isImageType(ext) ||
    isAudioType(ext) ||
    isVideoType(ext) ||
    isModelType(ext)
  ) {
    return 'med';
  } else {
    return 'dat';
  }
};
function _roundedRectanglePath({
  top,
  left,
  width,
  height,
  borderRadius,
}) {
  const path = new Path2D();
  path.moveTo(left + borderRadius, top);
  path.lineTo(left + width - borderRadius, top);
  path.quadraticCurveTo(left + width, top, left + width, top + borderRadius);
  path.lineTo(left + width, top + height - borderRadius);
  path.quadraticCurveTo(left + width, top + height, left + width - borderRadius, top + height);
  path.lineTo(left + borderRadius, top + height);
  path.quadraticCurveTo(left, top + height, left, top + height - borderRadius);
  path.lineTo(left, top + borderRadius);
  path.quadraticCurveTo(left, top, left + borderRadius, top);
  return path;
}
const isImageType = ext => /^(?:png|jpg|jfif|gif|svg|bmp)$/i.test(ext);
const isAudioType = ext => ext === 'mp3' || ext === 'ogg' || ext === 'wav';
const isVideoType = ext => ext === 'webm' || ext === 'mp4' || ext === 'mov';
const isModelType = ext => ext === 'obj' || ext === 'dae' || ext === 'fbx' || ext === 'mtl' || ext === 'tar';

const LENS_SHADER = {
  uniforms: {
    textureMap: {
      type: 't',
      value: null,
    },
    opacity: {
      type: 'f',
      value: 0,
    },
  },
  vertexShader: [
    "varying vec4 texCoord;",
    "void main() {",
    "  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
    "  vec4 position = projectionMatrix * mvPosition;",
    "  texCoord = position;",
    "  texCoord.xy = 0.5*texCoord.xy + 0.5*texCoord.w;",
    "  gl_Position = position;",
    "}"
  ].join("\n"),
  fragmentShader: [
    "uniform sampler2D textureMap;",
    "uniform float opacity;",
    "varying vec4 texCoord;",
    "void main() {",
    "  vec4 diffuse = texture2DProj(textureMap, texCoord);",
    "  gl_FragColor = vec4(mix(diffuse.rgb, vec3(0, 0, 0), 0.5), diffuse.a * opacity);",
    "}"
  ].join("\n")
};

class Inventory {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;
    const {
      metadata: {
        server: {
          enabled: serverEnabled,
        },
        offline,
        offlinePlugins,
      },
    } = archae;

    const cleanups = [];
    this._cleanup = () => {
      const oldCleanups = cleanups.slice();
      for (let i = 0; i < oldCleanups.length; i++) {
        const cleanup = oldCleanups[i];
        cleanup();
      }
    };

    let live = true;
    cleanups.push(() => {
      live = false;
    });

    const _requestImage = src => new Promise((accept, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        accept(img);
      };
      img.onerror = err => {
        reject(err);
      };
      img.src = src;
    });
    const _requestImageBitmap = src => _requestImage(src)
      .then(img => createImageBitmap(img, 0, 0, img.width, img.height));
    const imageDataCanvas = document.createElement('canvas');
    const imageDataCtx = imageDataCanvas.getContext('2d');
    const _requestImageData = src => _requestImageBitmap(src)
      .then(img => {
        const {width, height} = img;

        imageDataCanvas.width = width;
        imageDataCanvas.height = height;
        imageDataCtx.drawImage(img, 0, 0);
        return imageDataCtx.getImageData(0, 0, width, height);
      });
    const _cloneImageData = imageData => new ImageData(imageData.data.slice(), imageData.width, imageData.height);
    /* const _requestModReadme = (name, version) => {
      let live = true;
      const result = new Promise((accept, reject) => {
        _requestImageBitmap(`https://try.zeovr.io/readme/${name}/${version}`)
          .then(img => {
            if (live) {
              accept(img);
            }
          }, reject)
      });
      result.cancel = () => {
        live = false;
      };
      return result;
    }; */
    const _resJson = res => {
      if (res.status >= 200 && res.status < 300) {
        return res.json();
      } else if (res.status === 404) {
        return Promise.resolve(null);
      } else {
        return Promise.reject({
          status: res.status,
          stack: 'API returned invalid status code: ' + res.status,
        });
      }
    };
    const _resArrayBuffer = res => {
      if (res.status >= 200 && res.status < 300) {
        return res.arrayBuffer();
      } else if (res.status === 404) {
        return Promise.resolve(null);
      } else {
        return Promise.reject({
          status: res.status,
          stack: 'API returned invalid status code: ' + res.status,
        });
      }
    };

    let remoteMods = [];
    const _requestRemoteMods = () => {
      if (!offline) {
        return fetch('archae/rend/search')
          .then(_resJson)
          .catch(err => {
            console.warn(err);

            return Promise.resolve([]);
          });
      } else {
        return Promise.all(
          offlinePlugins.map(({name, version}) =>
            fetch(`https://my-site.zeovr.io/mods/${name}`)
              .then(_resJson)
          )
        );
      }
    };
    const _refreshRemoteMods = () => _requestRemoteMods()
      .then(newRemoteMods => {
        remoteMods = newRemoteMods;
      });
    _refreshRemoteMods()
      .catch(err => {
        console.warn(err);
      });
    const refreshModsInterval = setInterval(() => {
      _refreshRemoteMods()
        .catch(err => {
          console.warn(err);
        });
    }, 2 * 60 * 1000);
    cleanups.push(() => {
      clearInterval(refreshModsInterval);
    });

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/bootstrap',
        '/core/engines/input',
        '/core/engines/three',
        '/core/engines/webvr',
        '/core/engines/biolumi',
        '/core/engines/rend',
        '/core/engines/world',
        '/core/engines/tags',
        '/core/engines/wallet',
        '/core/engines/resource',
        '/core/engines/hand',
        '/core/engines/multiplayer',
        '/core/engines/notification',
        '/core/engines/anima',
        '/core/utils/js-utils',
        '/core/utils/hash-utils',
        '/core/utils/vrid-utils',
        '/core/utils/sprite-utils',
        '/core/utils/menu-utils',
      ]),
      // _requestImageBitmap('/archae/inventory/img/menu.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/arrow-up.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/arrow-down.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/chevron-left.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/close.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/triangle-down.png'),
      _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/link.png'),
      // _requestImageBitmap('/archae/plugins/_core_engines_inventory/serve/box.png'),
      _requestImageData('/archae/plugins/_core_engines_inventory/serve/file.png'),
      _requestImageData('/archae/plugins/_core_engines_inventory/serve/image.png'),
      _requestImageData('/archae/plugins/_core_engines_inventory/serve/audio.png'),
      _requestImageData('/archae/plugins/_core_engines_inventory/serve/video.png'),
      _requestImageData('/archae/plugins/_core_engines_inventory/serve/model.png'),
      // _requestImageBitmap('/archae/inventory/img/color.png'),
    ]).then(([
      [
        bootstrap,
        input,
        three,
        webvr,
        biolumi,
        rend,
        world,
        tags,
        wallet,
        resource,
        hand,
        multiplayer,
        notification,
        anima,
        jsUtils,
        hashUtils,
        vridUtils,
        spriteUtils,
        menuUtils,
      ],
      // menuImg,
      arrowUpImg,
      arrowDownImg,
      chevronLeftImg,
      closeImg,
      triangleDownImg,
      linkImg,
      // boxImg,
      fileImgData,
      imageImgData,
      audioImgData,
      videoImgData,
      modelImgData,
      // colorImg,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = three;
        const {materials: {assets: assetsMaterial}, sfx} = resource;
        const {base64} = jsUtils;
        const {murmur} = hashUtils;
        const {vridApi} = vridUtils;

        const THREEEffectComposer = EffectComposer(THREE);
        const {THREERenderPass, THREEShaderPass} = THREEEffectComposer;
        const THREEBlurShader = BlurShader(THREE);

        const colorWheelImg = menuUtils.getColorWheelImg();

        if (offline) {
          for (let i = 0; i < offlinePlugins.length; i++) {
            const offlinePlugin = offlinePlugins[i];
            const {name: modName, version} = offlinePlugin;
            const remoteMod = remoteMods.find(modSpec => modSpec.name === modName);

            if (remoteMod && remoteMod.metadata && remoteMod.metadata.items && Array.isArray(remoteMod.metadata.items)) {
              const {items} = remoteMod.metadata;

              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const {name: itemName, ext, type = null, attributes = {}} = item;

                fetch(`https://my-site.zeovr.io/img/mods/${modName}/${i}`)
                  .then(_resArrayBuffer)
                  .then(arrayBuffer => base64.encode(arrayBuffer))
                  .then(icon => {
                    const id = _makeId();
                    const ext = 'itm';
                    const path = modName + (type ? ('/' + type) : '');
                    const fullWidth = items.length * 0.5;
                    const position = localMatrix.compose(
                      localVector.set(-(items.length-1)*fullWidth/2 + i*fullWidth/items.length, 1, -1),
                      zeroQuaternion,
                      oneVector,
                    ).toArray();
                    const itemSpec = {
                      type: 'asset',
                      id: _makeId(),
                      name: itemName,
                      displayName: itemName,
                      attributes: {
                        type: {value: 'asset'},
                        id: {value: id},
                        name: {value: itemName},
                        ext: {value: ext},
                        path: {value: path},
                        attributes: {value: attributes},
                        icon: {value: icon},
                        position: {value: position},
                        physics: {value: true},
                        visible: {value: true},
                        open: {value: false},
                      },
                      metadata: {},
                    };
                    wallet.makeItem(itemSpec);
                  })
                  .catch(err => {
                    console.warn(err);
                  });
              }
            }
          }
        }

        const rowHeight = 100;
        const localColor = new THREE.Color();
        const renderAttributes = (canvas, ctx, attributes, attributeSpecs, fontSize, x, y, w, h, menuState) => {
          ctx.font = `${fontSize}px Open sans`;

          const attributeNames = Object.keys(attributeSpecs);
          for (let i = Math.min(attributeNames.length - 1, (menuState.page + 1) * 7); i >= (menuState.page * 7); i--) {
            const attributeName = attributeNames[i];
            const attributeSpec = attributeSpecs[attributeName];
            const {type} = attributeSpec;

            const attributeObject = attributes[attributeName] || {};
            let {value} = attributeObject;
            if (value === undefined) {
              value = attributeSpec.value;
            }

            const di = i - menuState.page * 7;

            if (type === 'matrix') {
              ctx.fillStyle = '#EEE';
              ctx.fillRect(x, y + h + i*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2);
              ctx.fillStyle = '#111';
              ctx.fillText(value.join(','), x, y + h + fontSize*2 - fontSize*0.3 + di*rowHeight, ITEM_MENU_INNER_SIZE);
            } else if (type === 'vector') {
              ctx.fillStyle = '#EEE';
              ctx.fillRect(x, y + h + i*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2);
              ctx.fillStyle = '#111';
              ctx.fillText(value.join(','), x, y + h + fontSize*2 - fontSize*0.3 + di*rowHeight, ITEM_MENU_INNER_SIZE);
            } else if (type === 'text') {
              ctx.fillStyle = '#EEE';
              ctx.fillRect(x, y + h + i*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2);
              ctx.fillStyle = '#111';
              ctx.fillText(value, x, y + h + fontSize*2 - fontSize*0.3 + di*rowHeight, ITEM_MENU_INNER_SIZE);
            } else if (type === 'number') {
              const {min, max} = attributeSpec;

              if (min === undefined) {
                min = 0;
              }
              if (max === undefined) {
                max = 10;
              }

              const factor = (value - min) / (max - min);

              ctx.fillStyle = '#CCC';
              ctx.fillRect(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, 5);
              ctx.fillStyle = '#ff4b4b';
              ctx.fillRect(x + (factor * ITEM_MENU_INNER_SIZE), y + h - 25 + di*rowHeight, 5, 25 + 5 + 25);
            } else if (type === 'select') {
              if (menuState.focus !== attributeName) {
                ctx.fillStyle = '#FFF';
                ctx.fillRect(x, y + h + i*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2);

                ctx.fillStyle = '#111';
                ctx.fillText(value, x, y + h + fontSize*2 - fontSize*0.5 + di*rowHeight, ITEM_MENU_INNER_SIZE);
                ctx.drawImage(triangleDownImg, w + ITEM_MENU_INNER_SIZE - fontSize*2, y + h + di*rowHeight, fontSize*2, fontSize*2);

                ctx.strokeStyle = '#111';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2);
              } else {
                const {options} = attributeSpec;

                ctx.fillStyle = '#FFF';
                ctx.fillRect(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, Math.max(options.length, 1) * fontSize*2);

                for (let j = 0; j < options.length; j++) {
                  const option = options[j];

                  if (value === option) {
                    ctx.fillStyle = '#EEE';
                    ctx.fillRect(x, y + h + di*rowHeight + j*fontSize*2, ITEM_MENU_INNER_SIZE, fontSize*2);
                  }

                  ctx.fillStyle = '#111';
                  ctx.fillText(option, x, y + h + fontSize*2 - fontSize*0.5 + di*rowHeight + j*fontSize*2, ITEM_MENU_INNER_SIZE);
                }

                ctx.strokeStyle = '#111';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, Math.max(options.length, 1) * fontSize*2);
              }
            } else if (type === 'color') {
              ctx.strokeStyle = '#111';
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y + h + di*rowHeight, fontSize*2, fontSize*2);
              ctx.fillStyle = value;
              ctx.fillRect(x + 5, y + h + 5 + di*rowHeight, fontSize*2 - 5*2, fontSize*2 - 5*2);
              ctx.fillStyle = '#EEE';
              ctx.fillRect(x + fontSize*2, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE - fontSize*2, fontSize*2);
              ctx.fillStyle = '#111';
              ctx.fillText(value, x + fontSize*2, y + h + fontSize*2 - fontSize*0.3 + di*rowHeight, ITEM_MENU_INNER_SIZE);

              if (menuState.focus === attributeName) {
                ctx.drawImage(colorWheelImg, x, y + h + di*rowHeight, 256, 256);
              }
            } else if (type === 'checkbox') {
              if (value) {
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y + h + di*rowHeight, 60, 30);

                ctx.fillStyle = '#111';
                ctx.fillRect(x + 30, y + h + 5 + di*rowHeight, (60 - 5*2)/2, 30 - 5*2);
              } else {
                ctx.strokeStyle = '#CCC';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y + h + di*rowHeight, 60, 30);

                ctx.fillStyle = '#CCC';
                ctx.fillRect(x + 5, y + h + 5 + di*rowHeight, (60 - 5*2)/2, 30 - 5*2);
              }
            } else if (type === 'file') {
              ctx.fillStyle = '#EEE';
              ctx.fillRect(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE - fontSize*2, fontSize*2);
              ctx.fillStyle = '#111';
              ctx.fillText(value, x, y + h + fontSize*2 - fontSize*0.3 + di*rowHeight, ITEM_MENU_INNER_SIZE);
              ctx.drawImage(linkImg, x + ITEM_MENU_INNER_SIZE - fontSize*2, y + h + di*rowHeight, fontSize*2, fontSize*2);
            }
          }

          const barSize = 80;
          const numPages = Math.max(Math.ceil(attributeNames.length / 7), 1);
          ctx.fillStyle = '#CCC';
          ctx.fillRect(canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2);
          if (numPages > 1) {
            ctx.fillStyle = '#ff4b4b';
            ctx.fillRect(
              canvas.width - 150 + (barSize-30)/2, 150 + barSize + _snapToPixel(canvas.height - 150 - barSize*2, numPages, menuState.barValue),
              30, (canvas.height - 150 - barSize*2) / numPages
            );
          }
          ctx.drawImage(arrowUpImg, canvas.width - 150, 150, barSize, barSize);
          ctx.drawImage(arrowDownImg, canvas.width - 150, canvas.height - barSize, barSize, barSize);
        };
        const getAttributesAnchors = (result, attributes, attributeSpecs, fontSize, x, y, w, h, menuState, {focusAttribute, update}) => {
          const _pushAttributeAnchor = (x, y, w, h, name, type, newValue) => {
            _pushAnchor(result, x, y, w, h, (e, hoverState) => {
              if (type === 'number') {
                const attributeSpec = attributeSpecs[name];
                const {min, max, step} = attributeSpecs[name];

                const fx = (hoverState.x - x) / w;

                newValue = min + (fx * (max - min));
                if (step > 0) {
                  newValue = _roundToDecimals(Math.round(newValue / step) * step, 8);
                }
              } else if (type === 'select') {
                // nothing
              } else if (type === 'color') {
                if (typeof newValue === 'function') {
                  const fx = (hoverState.x - x) / w;
                  const fy = (hoverState.y - y) / h;

                  newValue = newValue(fx, fy);
                }
              } else if (type === 'checkbox') {
                // nothing
              }

              focusAttribute({
                name,
                type,
                newValue,
              });
            });
          };

          const attributeNames = Object.keys(attributeSpecs);
          for (let i = menuState.page * 7; i < attributeNames.length && i < ((menuState.page + 1) * 7); i++) {
            const attributeName = attributeNames[i];
            const attributeSpec = attributeSpecs[attributeName];
            const {type} = attributeSpec;

            const attributeObject = attributes[attributeName] || {};
            let {value} = attributeObject;
            if (value === undefined) {
              value = attributeSpec.value;
            }

            const di = i - menuState.page * 7;

            if (type === 'matrix') {
              _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2, attributeName, type);
            } else if (type === 'vector') {
              _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2, attributeName, type);
            } else if (type === 'text') {
              _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2, attributeName, type);
            } else if (type === 'number') {
              _pushAttributeAnchor(x, y + h - 25 + di*rowHeight, ITEM_MENU_INNER_SIZE, 25 + 5 + 25, attributeName, type);
            } else if (type === 'select') {
              if (menuState.focus !== attributeName) {
                _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, fontSize*2, attributeName, type);
              } else {
                const {options} = attributeSpec;
                for (let j = 0; j < options.length; j++) {
                  _pushAttributeAnchor(x, y + h + di*rowHeight + j*fontSize*2, ITEM_MENU_INNER_SIZE, fontSize*2, attributeName, type, options[j]);
                }
              }
            } else if (type === 'color') {
              if (menuState.focus === attributeName) {
                _pushAttributeAnchor(x, y + h + di*rowHeight, 256, 256, attributeName, type, (fx, fy) => '#' + localColor.setHex(colorWheelImg.getColor(fx, fy)).getHexString());
              }

              _pushAttributeAnchor(x, y + h + di*rowHeight, fontSize*2, fontSize*2, attributeName, type);
              _pushAttributeAnchor(x + fontSize*2, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE - fontSize*2, fontSize*2, attributeName, type);
            } else if (type === 'checkbox') {
              _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE, 30, attributeName, type, !value);
            } else if (type === 'file') {
              _pushAttributeAnchor(x, y + h + di*rowHeight, ITEM_MENU_INNER_SIZE - fontSize*2, fontSize*2, attributeName, type);
            }
          }

          const barSize = 80;
          const numPages = Math.ceil(attributeNames.length / 7);
          _pushAnchor(result, canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2, e => {
            if (numPages > 0) {
              const {side} = e;

              onmove = () => {
                const hoverState = uiTracker.getHoverState(side);
                menuState.barValue = Math.min(Math.max(hoverState.y - (150 + barSize), 0), canvas.height - 150 - barSize*2) / (canvas.height - 150 - barSize*2);
                const {page: oldPage} = menuState;
                const newPage = _snapToIndex(numPages, menuState.barValue);

                if (newPage !== oldPage) {
                  menuState.page = newPage;

                  _renderMenu();
                  plane.anchors = _getAnchors();
                }
              };
            }
          });
          _pushAnchor(result, canvas.width - 150, 150, barSize, barSize, e => {
            const {page: oldPage} = menuState;
            const newPage = Math.max(menuState.page - 1, 0);

            if (newPage !== oldPage) {
              menuState.page = newPage;
              menuState.barValue = menuState.page / (numPages - 1);

              _renderMenu();
              plane.anchors = _getAnchors();
            }
          });
          _pushAnchor(result, canvas.width - 150, canvas.height - barSize, barSize, barSize, e => {
            const {page: oldPage} = menuState;
            const newPage = Math.min(menuState.page + 1, numPages - 1);

            if (newPage !== oldPage) {
              menuState.page = newPage;
              menuState.barValue = menuState.page / (numPages - 1);

              _renderMenu();
              plane.anchors = _getAnchors();
            }
          });
        };

        const _updateInstalled = () => {
          for (let i = 0; i < remoteMods.length; i++) {
            const remoteMod = remoteMods[i];
            const installed = tags.getTagMeshes()
              .some(({item}) => item.type === 'entity' && item.module === remoteMod.displayName);
            remoteMod.installed = installed;
          }
        };
        _updateInstalled();

        const _quantizeAssets = assets => {
          const assetIndex = {};
          for (let i = 0; i < assets.length; i++) {
            const assetSpec = assets[i];
            const {id} = assetSpec;

            let entry = assetIndex[id];
            if (!entry) {
              entry = _clone(assetSpec);
              // entry.assets = [];
              assetIndex[id] = entry;
            }
            // entry.assets.push(assetSpec);
          }
          return Object.keys(assetIndex).map(k => assetIndex[k]);
        };
        let assets = _quantizeAssets(wallet.getAssets());
        // let equipments = wallet.getEquipments();
        /* let mods = tags.getTagMeshes()
          .filter(({item}) => item.type === 'entity')
          .map(({item}) => item); */
        const _worldAdd = tagMesh => {
          const {item} = tagMesh;
          if (item.type === 'entity') {
            // mods.push(item);
            /* localMods = _getLocalMods();
            serverAnchors = _getServerAnchors();
            modAnchors = _getModAnchors();
            serverBarValue = 0;
            serverPage = 0;
            serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 0;

            _updateInstalled();

            _renderMenu();

            serverAnchors = _getServerAnchors();
            modAnchors = _getModAnchors();
            plane.anchors = _getAnchors(); */

            planeMeshLeft.render();
            planeLeft.updateAnchors();
            assetsMesh.render();
          }
        };
        world.on('add', _worldAdd);
        const _walletAssets = newAssets => {
          assets = _quantizeAssets(newAssets);
          localAssets = _getLocalAssets();
          localAsset = null;
          inventoryPage = 0;
          inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;
          inventoryBarValue = 0;

          _renderMenu();
        };
        wallet.on('assets', _walletAssets);

        /* let planeMeshes = {};
        let numPlaneMeshCloses = 0;
        const _gcPlaneMeshes = () => {
          if (++numPlaneMeshCloses >= 10) {
            const newPlaneMeshes = {};
            for (const id in planeMeshes) {
              const planeMesh = planeMeshes[id]

              if (planeMesh) {
                planeMeshes[id] = planeMesh;
              }
            }
            planeMeshes = newPlaneMeshes;
            numPlaneMeshCloses = 0;
          }
        };
        const _walletMenuOpen = grabbable => {
          const {assetId: id, position, rotation, scale, json} = grabbable;
          const attributes = (json && json.data && json.data.attributes && typeof json.data.attributes === 'object' && !Array.isArray(json.data.attributes)) ?
            json.data.attributes
            : {};

          let match;
          if (grabbable && grabbable.ext === 'itm' && grabbable.json && grabbable.json.data && grabbable.json.data.path && typeof grabbable.json.data.path === 'string' && (match = grabbable.json.data.path.match(/^(.+?)\/(.+?)$/))) {
            const modName = match[1];
            const fileType = match[2];

            const modSpec = remoteMods.find(modSpec => modSpec.displayName === modName);
            if (modSpec && modSpec.metadata && modSpec.metadata.items && Array.isArray(modSpec.metadata.items) && modSpec.metadata.items.length > 0) {
              const itemSpec = modSpec.metadata.items[0];
              const {attributes: attributeSpecs} = itemSpec;

              const canvas = document.createElement('canvas');
              canvas.width = ITEM_MENU_SIZE;
              canvas.height = ITEM_MENU_SIZE;
              const ctx = canvas.getContext('2d');

              const texture = new THREE.Texture(
                canvas,
                THREE.UVMapping,
                THREE.ClampToEdgeWrapping,
                THREE.ClampToEdgeWrapping,
                THREE.LinearFilter,
                THREE.LinearFilter,
                THREE.RGBAFormat,
                THREE.UnsignedByteType,
                16
              );

              const itemMenuState = {
                focus: null,
                barValue: 0,
                page: 0,
              };

              const _renderItemMenu = () => {
                ctx.fillStyle = '#FFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                renderAttributes(ctx, attributes, attributeSpecs, fontSize, ITEM_MENU_BORDER_SIZE, ITEM_MENU_BORDER_SIZE, itemMenuState);

                texture.needsUpdate = true;
              };
              _renderItemMenu();

              const planeMesh = _makePlaneMesh(ITEM_MENU_WORLD_SIZE, ITEM_MENU_WORLD_SIZE, texture);
              planeMesh.position.copy(position);
              planeMesh.quaternion.copy(rotation);
              planeMesh.scale.copy(scale);
              planeMesh.grabbable = grabbable;
              scene.add(planeMesh);

              const plane = new THREE.Object3D();
              plane.visible = false;
              plane.width = ITEM_MENU_SIZE;
              plane.height = ITEM_MENU_SIZE;
              plane.worldWidth = ITEM_MENU_WORLD_SIZE;
              plane.worldHeight = ITEM_MENU_WORLD_SIZE;
              plane.open = true;
              plane.anchors = [];
              planeMesh.add(plane);
              planeMesh.plane = plane;

              const _getAssetId = () => String(murmur(JSON.stringify([
                grabbable.name,
                grabbable.ext,
                grabbable.path,
                grabbable.attributes,
              ])));
              const _updateAttributesAnchors = () => {
                plane.anchors = getAttributesAnchors(attributes, attributeSpecs, fontSize, ITEM_MENU_BORDER_SIZE, ITEM_MENU_BORDER_SIZE, itemMenuState, {
                  focusAttribute: ({name: attributeName, type, newValue}) => {
                    if (type === 'number') {
                      grabbable.setAttribute(attributeName, newValue);
                      grabbable.assetId = _getAssetId();

                      itemMenuState.focus = null;
                    } else if (type === 'select') {
                      if (newValue !== undefined) {
                        grabbable.setAttribute(attributeName, newValue);
                        grabbable.assetId = _getAssetId();

                        itemMenuState.focus = null;
                      } else {
                        itemMenuState.focus = attributeName;
                      }
                    } else if (type === 'color') {
                      if (newValue !== undefined) {
                        grabbable.setAttribute(attributeName, newValue);
                        grabbable.assetId = _getAssetId();

                        itemMenuState.focus = null;
                      } else {
                        itemMenuState.focus = attributeName;
                      }
                    } else if (type === 'checkbox') {
                      grabbable.setAttribute(attributeName, newValue);
                      grabbable.assetId = _getAssetId();

                      itemMenuState.focus = null;
                    } else {
                      itemMenuState.focus = null;
                    }

                    _renderItemMenu();
                    _updateAttributesAnchors();
                  },
                  render: _renderItemMenu,
                  updateAnchors: _updateAttributesAnchors,
                });
              };
              _updateAttributesAnchors();

              planeMesh.updateMatrixWorld()
              plane.updateMatrixWorld();
              planeMeshes[id] = planeMesh;

              uiTracker.addPlane(plane);
            }
          }
        };
        wallet.on('menuopen', _walletMenuOpen);
        const _walletMenuClose = grabbable => {
          for (const id in planeMeshes) {
            const planeMesh = planeMeshes[id];
            if (planeMesh.grabbable === grabbable) {
              const {plane} = planeMesh;

              uiTracker.removePlane(plane);

              scene.remove(planeMesh);
              planeMesh.geometry.dispose();
              planeMesh.material.dispose();
              planeMeshes[id] = null;

              _gcPlaneMeshes();

              break;
            }
          }
        };
        wallet.on('menuclose', _walletMenuClose);

        const _menudown = e => {
          const grabbable = hand.getGrabbedGrabbable(e.side);

          if (grabbable) {
            grabbable.release();
            grabbable.setOpen(true);
            grabbable.hide();
            grabbable.disablePhysics(); *

            e.stopImmediatePropagation();
          }
        };
        input.on('menudown', _menudown, {
          priority: 1,
        }); */

        const localVector = new THREE.Vector3();
        const localVector2 = new THREE.Vector3();
        const localQuaternion = new THREE.Quaternion();
        const localMatrix = new THREE.Matrix4();
        const zeroQuaternion = new THREE.Quaternion();
        const oneVector = new THREE.Vector3(1, 1, 1);
        const zeroVector = new THREE.Vector3();
        const pixelSize = 0.01;

        const _requestModFileImageData = modSpec => resource.getModFileImageData(modSpec.displayName, 0)
          .then(arrayBuffer => ({
            width: 16,
            height: 16,
            data: new Uint8Array(arrayBuffer),
          }));
        const _requestAssetImageData = assetSpec => (() => {
          if (assetSpec.ext === 'itm') {
            if (assetSpec.json && assetSpec.json.data && assetSpec.json.data.icon && typeof assetSpec.json.data.icon === 'string') {
              return new Promise((accept, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                  imageDataCanvas.width = img.naturalWidth;
                  imageDataCanvas.height = img.naturalHeight;
                  imageDataCtx.drawImage(img, 0, 0);
                  const imageData = imageDataCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
                  accept(imageData.data.buffer);
                };
                img.onerror = err => {
                  reject(err);
                };
                img.src = 'data:application/octet-stream;base64,' + assetSpec.json.data.icon;
              });
            } else {
              return resource.getItemImageData(assetSpec.name);
            }
          } else /* if (asset.ext === 'files') */ {
            return resource.getFileImageData(assetSpec.name);
          }
          /* } else if (type === 'mod') {
            return resource.getModImageData(name);
          } else if (type === 'skin') {
            return resource.getSkinImageData(name);
          } else {
            return Promise.resolve(null);
          } */
        })().then(arrayBuffer => ({
          width: 16,
          height: 16,
          data: new Uint8Array(arrayBuffer),
        }));

        const _makeRenderTarget = (width, height) => new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          // format: THREE.RGBFormat,
          format: THREE.RGBAFormat,
        });

        const uiTracker = biolumi.makeUiTracker();

        const menuState = {
          open: false,
          /* position: new THREE.Vector3(0, DEFAULT_USER_HEIGHT, -1.5),
          rotation: new THREE.Quaternion(),
          scale: new THREE.Vector3(1, 1, 1), */
          barValue: 0,
          page: 0,
        };
        const planeLeftState = {
          barValue: 0,
          page: 0,
        };
        const planeRightState = {
          barValue: 0,
          page: 0,
        };

        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.Texture(
          canvas,
          THREE.UVMapping,
          THREE.ClampToEdgeWrapping,
          THREE.ClampToEdgeWrapping,
          THREE.NearestFilter,
          THREE.NearestFilter,
          THREE.RGBAFormat,
          THREE.UnsignedByteType
        );

        let tab = 'status';
        let subtab = 'itm';
        const _getLocalAssets = () => assets
          .filter(assetSpec => {
            if (tab === 'files') {
              return _normalizeType(assetSpec.ext) === subtab;
            } else {
              return true;
            }
          })
          .slice(inventoryPage * numFilesPerPage, (inventoryPage + 1) * numFilesPerPage);
        const _getLocalMods = () => {
          if (subtab === 'installed') {
            return remoteMods
              .filter(modSpec => modSpec.installed);
          } else if (subtab === 'store') {
            return remoteMods
              .filter(modSpec => !modSpec.local);
          } else if (subtab === 'local') {
            return remoteMods
              .filter(modSpec => modSpec.local);
          } else {
            return [];
          }
        };

        /* let tabIndex = 0;
        let tabType = 'item';
        let inventoryPage = 0;
        let localAssets = _getLocalAssets();
        let localAsset = null;
        const localTabAssets = _getLocalAssets();
        let inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;
        let inventoryBarValue = 0;
        const inventoryIndices = {
          left: -1,
          right: -1,
        };
        let serverPage = 0;
        let localMods = _getLocalMods();
        let localMod = null;
        let modReadmeImg = null;
        let modReadmeImgPromise = null;
        let modBarValue = 0;
        let modPage = 0;
        let modPages = 0;
        let serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 1;
        let serverBarValue = 0;
        let serverIndex = -1; */
        let localImage = null;

        const _snapToIndex = (steps, value) => Math.min(Math.floor(steps * value), steps - 1);
        const _snapToPixel = (max, steps, value) => {
          const stepIndex = _snapToIndex(steps, value);
          const stepSize = max / steps;
          return stepIndex * stepSize;
        };

        let localProfileImg = null;
        let remoteProfiles = [];
        const _requestLocalProfilePicture = () => vridApi.get('name')
          .then(username => {
            if (username) {
              return _requestImageBitmap(`https://my-site.zeovr.io/profile/picture/${username}`)
                .catch(err => {
                  console.warn(err);

                  return Promise.resolve(null);
                });
            } else {
              return Promise.resolve(null);
            }
          });
        const _requestRemoteProfilePicture = username => _requestImageBitmap(`https://my-site.zeovr.io/profile/picture/${username}`)
          .catch(err => {
            console.warn(err);

            return Promise.resolve(null);
          });
        (() => {
          _requestLocalProfilePicture()
            .then(newProfileImg => {
              localProfileImg = newProfileImg;

              _renderMenu();
            })
            .catch(err => {
              console.warn(err);
            });
          const usernames = multiplayer.getUsers();
          Promise.all(usernames.map(username => _requestRemoteProfilePicture(username)))
            .then(profileImgs => {
              for (let i = 0; i < usernames.length; i++) {
                const username = usernames[i];
                const profileImg = profileImgs[i];
                remoteProfiles.push({
                  username,
                  profileImg,
                });
              }

              _renderMenu();
            })
            .catch(err => {
              console.warn(err);
            });
        })();
        const _playerEnter = ({id, username}) => {
          _requestRemoteProfilePicture(username)
            .then(profileImg => {
              remoteProfiles.push({
                username,
                profileImg,
              });

              _renderMenu();
            })
            .catch(err => {
              console.warn(err);
            });
        };
        multiplayer.on('playerEnter', _playerEnter);
        const _playerLeave = ({id, username}) => {
          const index = remoteProfiles.findIndex(remoteProfile => remoteProfile.username === username);
          if (index !== -1) {
            remoteProfiles.splice(index, 1);
          }

          _renderMenu();
        };
        multiplayer.on('playerLeave', _playerLeave);
        cleanups.push(() => {
          multiplayer.removeListener('playerEnter', _playerEnter);
          multiplayer.removeListener('_playerLeave', _playerLeave);
        });

        const _renderMenu = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // ctx.fillStyle = '#FFF';
          // ctx.fillRect(0, 0, canvas.width, canvas.height);

          /* ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, canvas.width, 150);

          ctx.font = `${fontSize}px Open sans`;
          // ctx.textBaseline = 'bottom';
          ctx.fillStyle = tab === 'status' ? '#4CAF50' : '#FFF';
          ctx.fillText('Status', canvas.width * 0/8 + (canvas.width/8 - ctx.measureText('Status').width)/2, 150 - 60, canvas.width / 8);
          ctx.fillStyle = tab === 'mods' ? '#4CAF50' : '#FFF';
          ctx.fillText('Mods', canvas.width * 1/8 + (canvas.width/8 - ctx.measureText('Mods').width)/2, 150 - 60, canvas.width / 8);
          ctx.fillStyle = tab === 'files' ? '#4CAF50' : '#FFF';
          ctx.fillText('Files', canvas.width * 2/8 + (canvas.width/8 - ctx.measureText('Files').width)/2, 150 - 60, canvas.width / 8); */

          /* ctx.fillStyle = '#4CAF50';
          if (tab === 'status') { */

          ctx.fillRect(canvas.width * 0/8, -10, canvas.width / 8, 10);

          ctx.fillStyle = '#EEE';
          ctx.fillRect(0, 0, canvas.width, 150);

          if (localProfileImg) {
            ctx.drawImage(localProfileImg, canvas.width * 0.8, 20, 100, 100);
          } else {
            ctx.fillStyle = '#EEE';
            ctx.fillRect(canvas.width * 0.8, 20, 100, 100);
          }
          ctx.fillStyle = '#111';
          ctx.fillText(bootstrap.getUsername(), canvas.width * 0.8 + 100 + 30, 90);

          if (!focusState.type) {
            ctx.font = `${fontSize*1.6}px Open sans`;
            // ctx.fillText('My VR Server', 60, fontSize*2 + 35);

            ctx.font = `${fontSize}px Open sans`;
            for (let i = 0; i < remoteProfiles.length; i++) {
              const {username: remoteUsername, profileImg: remoteProfileImg} = remoteProfiles[i];

              if (remoteProfileImg) {
                ctx.drawImage(remoteProfileImg, 40, 150 + 40 + i*(100 + 40), 100, 100);

                ctx.fillStyle = '#111';
                ctx.fillText(remoteUsername, 40 + 100 + 30, 150 + 100 + i*(100 + 40));
              } else {
                ctx.fillStyle = '#EEE';
                ctx.fillRect(40, 150 + 40 + i*(100 + 40), 100, 100);
              }
            }
          } else if (focusState.type === 'leftPane' || focusState.type === 'rightPane') {
            const {target} = focusState;

            ctx.drawImage(chevronLeftImg, ITEM_MENU_BORDER_SIZE, 150, fontSize*2 + ITEM_MENU_BORDER_SIZE, fontSize*2 + ITEM_MENU_BORDER_SIZE);
            ctx.fillStyle = '#111';
            ctx.fillText(`${target.name}.${target.ext}`, ITEM_MENU_BORDER_SIZE + fontSize*2 + ITEM_MENU_BORDER_SIZE, 150 + fontSize*2 + ITEM_MENU_BORDER_SIZE - 40);
            ctx.drawImage(closeImg, ITEM_MENU_INNER_SIZE - fontSize*2, 150, fontSize*2 + ITEM_MENU_BORDER_SIZE, fontSize*2 + ITEM_MENU_BORDER_SIZE);

            const {ext} = target;
            if (ext === 'itm') {
              const {json} = target;

              if (json && json.data && json.data.attributes && typeof json.data.path === 'string') {
                const path = json.data.path;
                const match = path.match(/^(.+?)\/(.+?)$/);

                if (match) {
                  const moduleName = match[1];
                  const itemName = match[2];
                  const module = remoteMods.find(moduleSpec => moduleSpec.name === moduleName);

                  if (module) {
                    const item = module.metadata.items.find(itemSpec => itemSpec.type === itemName);

                    if (item) {
                      const attributes = (json && json.data && json.data.attributes && typeof json.data.attributes === 'object' && !Array.isArray(json.data.attributes)) ?
                        json.data.attributes
                        : {};
                      const {attributes: attributeSpecs} = item;
                      renderAttributes(canvas, ctx, attributes, attributeSpecs, fontSize, ITEM_MENU_BORDER_SIZE, 150 + fontSize*2, ITEM_MENU_BORDER_SIZE, ITEM_MENU_BORDER_SIZE, itemMenuState);
                      plane.anchors = _getAnchors();
                    }
                  }
                }
              }
            }
          }
          /* } else if (tab === 'mods') {
            ctx.fillRect(canvas.width * 1/8, 150 - 10, canvas.width / 8, 10);

            // subheader
            ctx.fillStyle = '#EEE';
            ctx.fillRect(0, 150, canvas.width, 150);
            ctx.fillStyle = '#4CAF50';
            if (subtab === 'installed') {
              ctx.fillRect(canvas.width * 0/8, 150*2 - 10, canvas.width / 8, 10);
            } else if (subtab === 'store') {
              ctx.fillRect(canvas.width * 1/8, 150*2 - 10, canvas.width / 8, 10);
            } else if (subtab === 'local') {
              ctx.fillRect(canvas.width * 2/8, 150*2 - 10, canvas.width / 8, 10);
            }

            ctx.fillStyle = subtab === 'installed' ? '#4CAF50' : '#111';
            ctx.fillText('Installed', canvas.width * 0/8 + (canvas.width/8 - ctx.measureText('Installed').width)/2, 150*2 - 60, canvas.width / 8);
            ctx.fillStyle = subtab === 'store' ? '#4CAF50' : '#111';
            ctx.fillText('Store', canvas.width * 1/8 + (canvas.width/8 - ctx.measureText('Store').width)/2, 150*2 - 60, canvas.width / 8);
            ctx.fillStyle = subtab === 'local' ? '#4CAF50' : '#111';
            ctx.fillText('Local', canvas.width * 2/8 + (canvas.width/8 - ctx.measureText('Local').width)/2, 150*2 - 60, canvas.width / 8);

            if (modReadmeImg) {
              if (subtab === 'installed') {
                // config
                const {displayName} = localMod;
                const tagMesh = world.getTag({
                  type: 'entity',
                  name: displayName,
                });
                const {item} = tagMesh;
                const {attributes} = item;
                const attributeSpecs = tags.getAttributeSpecsMap(displayName);
                renderAttributes(ctx, attributes, attributeSpecs, fontSize, canvas.width - 640 - 40, 150*2 + 100 + 40, {}, {triangleDownImg, linkImg});
                // XXX render pointer to item grab

                // bar
                ctx.fillStyle = '#CCC';
                ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05, 30, (canvas.height - 150*2 - 100) * 0.9);
                ctx.fillStyle = '#ff4b4b';
                ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05 + _snapToPixel((canvas.height - 150*2 - 100) * 0.9, modPages, modBarValue), 30, (canvas.height - 150*2) * 0.9 / modPages);
              } else {
                // img
                ctx.drawImage(
                  modReadmeImg,
                  0, (modPages > 1 ? (modPage / (modPages - 1)) : 0) * (canvas.height - 150*2 - 100), 640, canvas.height - 150*2,
                  canvas.width - 640 - 40, 150*2 + 100, 640, canvas.height - 150*2 - 100
                );

                // bar
                ctx.fillStyle = '#CCC';
                ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05, 30, (canvas.height - 150*2 - 100) * 0.9);
                ctx.fillStyle = '#ff4b4b';
                ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05 + _snapToPixel((canvas.height - 150*2 - 100) * 0.9, modPages, modBarValue), 30, (canvas.height - 150*2) * 0.9 / modPages);
              }
            } else {
              // placeholder
              ctx.fillStyle = '#EEE';
              ctx.fillRect(canvas.width - 640 - 40, 150*2 + 100, 640, canvas.height - 150*2);
            }

            // installer
            if (localMod) {
              if (localMod.installed) {
                ctx.fillStyle = '#ff4b4b';
                ctx.fillRect(canvas.width - 640 - 40, 150*2, 640 + 40, 100);
                ctx.fillStyle = '#FFF';
                ctx.fillText('Running', canvas.width - 640 - 40 + (640 + 40 - ctx.measureText('Running').width)/2, 150*2 + 100 - 30);
              } else {
                ctx.fillStyle = '#4CAF50';
                ctx.fillRect(canvas.width - 640 - 40, 150*2, 640 + 60, 100);
                ctx.fillStyle = '#FFF';
                ctx.fillText('Install', canvas.width - 640 - 40 + (640 + 40 - ctx.measureText('Install').width)/2, 150*2 + 100 - 30);
              }
            }

            // bar
            ctx.fillStyle = '#CCC';
            ctx.fillRect(canvas.width - 640 - 40 - 60, 150*2 + (canvas.height - 150*2) * 0.05, 30, (canvas.height - 150*2) * 0.9);
            ctx.fillStyle = '#ff4b4b';
            ctx.fillRect(canvas.width - 640 - 40 - 60, 150*2 + (canvas.height - 150*2) * 0.05 + _snapToPixel((canvas.height - 150*2) * 0.9, serverPages, serverBarValue), 30, (canvas.height - 150*2) * 0.9 / serverPages);

            // files
            const l = Math.min(localMods.length - serverPage * numModsPerPage, numModsPerPage);
            for (let i = 0; i < l; i++) {
              const modSpec = localMods[serverPage * numModsPerPage + i];

              if (localMod === modSpec) {
                ctx.fillStyle = '#2196F3';
                ctx.fillRect(0, 150*2 + ((canvas.height - 150*2) * i/numModsPerPage), canvas.width - 640 - 40 - 60, (canvas.height - 150*2) / numModsPerPage);
                ctx.fillStyle = '#FFF';
                ctx.fillText(modSpec.displayName, canvas.width * 0.05, 150*2 + ((canvas.height - 150*2) * (i + 1)/numFilesPerPage) - 30, canvas.width * 0.9);
              } else {
                ctx.fillStyle = '#111';
                ctx.fillText(modSpec.displayName, canvas.width * 0.05, 150*2 + ((canvas.height - 150*2) * (i + 1)/numFilesPerPage) - 30, canvas.width * 0.9);
              }
            }
          } else if (tab === 'files') {
            ctx.fillRect(canvas.width * 2/8, 150 - 10, canvas.width / 8, 10);

            // subheader
            ctx.fillStyle = '#EEE';
            ctx.fillRect(0, 150, canvas.width, 150);
            ctx.fillStyle = '#4CAF50';
            if (subtab === 'itm') {
              ctx.fillRect(canvas.width * 0/8, 150*2 - 10, canvas.width / 8, 10);
            } else if (subtab === 'med') {
              ctx.fillRect(canvas.width * 1/8, 150*2 - 10, canvas.width / 8, 10);
            } else if (subtab === 'dat') {
              ctx.fillRect(canvas.width * 2/8, 150*2 - 10, canvas.width / 8, 10);
            } else if (subtab === 'pls') {
              ctx.fillRect(canvas.width * 3/8, 150*2 - 10, canvas.width / 8, 10);
            }

            ctx.fillStyle = subtab === 'itm' ? '#4CAF50' : '#111';
            ctx.fillText('Items', canvas.width * 0/8 + (canvas.width/8 - ctx.measureText('Items').width)/2, 150*2 - 60, canvas.width / 8);
            ctx.fillStyle = subtab === 'med' ? '#4CAF50' : '#111';
            ctx.fillText('Media', canvas.width * 1/8 + (canvas.width/8 - ctx.measureText('Media').width)/2, 150*2 - 60, canvas.width / 8);
            ctx.fillStyle = subtab === 'dat' ? '#4CAF50' : '#111';
            ctx.fillText('Data', canvas.width * 2/8 + (canvas.width/8 - ctx.measureText('Data').width)/2, 150*2 - 60, canvas.width / 8);
            ctx.fillStyle = subtab === 'pls' ? '#4CAF50' : '#111';
            ctx.fillText('Playlists', canvas.width * 3/8 + (canvas.width/8 - ctx.measureText('Playlists').width)/2, 150*2 - 60, canvas.width / 8);

            // installer
            if (localAsset) {
              if (localAsset.ext === 'pls') {
                const allInstalled = localAsset.playlist.every(playlistEntry => {
                  const {name} = playlistEntry;
                  return world.getTag({
                    type: 'entity',
                    name,
                  });
                });
                if (allInstalled) {
                  ctx.fillStyle = '#ff4b4b';
                  ctx.fillRect(canvas.width - 640 - 40, 150*2, 640 + 40, 100);
                  ctx.fillStyle = '#FFF';
                  ctx.fillText('Uninstall playlist', canvas.width - 640 - 40 + (640 + 40 - ctx.measureText('Uninstall playlist').width)/2, 150*2 + 100 - 30);
                } else {
                  ctx.fillStyle = '#4CAF50';
                  ctx.fillRect(canvas.width - 640 - 40, 150*2, 640 + 60, 100);
                  ctx.fillStyle = '#FFF';
                  ctx.fillText('Install playlist', canvas.width - 640 - 40 + (640 + 40 - ctx.measureText('Install playlist').width)/2, 150*2 + 100 - 30);
                }
              }
            }

            // bar
            ctx.fillStyle = '#CCC';
            ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05, 30, (canvas.height - 150*2 - 100) * 0.9);
            ctx.fillStyle = '#ff4b4b';
            ctx.fillRect(canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05 + _snapToPixel((canvas.height - 150*2 - 100) * 0.9, inventoryPages, inventoryBarValue), 30, (canvas.height - 150*2 - 100) * 0.9 / inventoryPages);

            // files
            const l = Math.min(localAssets.length - inventoryPage * numFilesPerPage, numFilesPerPage);
            for (let i = 0; i < l; i++) {
              const assetSpec = localAssets[inventoryPage * numFilesPerPage + i];

              if (localAsset === assetSpec) {
                ctx.fillStyle = '#2196F3';
                ctx.fillRect(0, 150*2 + ((canvas.height - 150*2) * i/numModsPerPage), canvas.width - 640 - 40 - 60, (canvas.height - 150*2) / numModsPerPage);
                ctx.fillStyle = '#FFF';
                ctx.fillText(assetSpec.name, canvas.width * 0.05, 150*2 + ((canvas.height - 150*2) * (i + 1)/numFilesPerPage) - 30, canvas.width * 0.9);
              } else {
                ctx.fillStyle = '#111';
                ctx.fillText(assetSpec.name, canvas.width * 0.05, 150*2 + ((canvas.height - 150*2) * (i + 1)/numFilesPerPage) - 30, canvas.width * 0.9);
              }
            }
          } */
          texture.needsUpdate = true;
        };
        // _renderMenu();

        const menuMesh = new THREE.Object3D();
        menuMesh.visible = false;
        scene.add(menuMesh);

        const plane = new THREE.Object3D();
        plane.width = WIDTH;
        plane.height = HEIGHT;
        plane.worldWidth = WORLD_WIDTH;
        plane.worldHeight = WORLD_HEIGHT;
        plane.open = false;
        const _pushAnchor = (anchors, x, y, w, h, triggerdown = null) => {
          anchors.push({
            left: x,
            right: x + w,
            top: y,
            bottom: y + h,
            triggerdown,
          });
        };
        let onmove = null;
        /* const tabsAnchors = [];
        _pushAnchor(tabsAnchors, canvas.width * 0/8, 0, canvas.width / 8, 150, (e, hoverState) => {
          tab = 'status';

          _renderMenu();
          assetsMesh.render();

          plane.anchors = _getAnchors();
        });
        _pushAnchor(tabsAnchors, canvas.width * 1/8, 0, canvas.width / 8, 150, (e, hoverState) => {
          tab = 'mods';
          subtab = 'installed';

          localMods = _getLocalMods();
          serverBarValue = 0;
          serverPage = 0;
          serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 0;

          _renderMenu();
          assetsMesh.render();

          serverAnchors = _getServerAnchors();
          modAnchors = _getModAnchors();
          plane.anchors = _getAnchors();
        });
        _pushAnchor(tabsAnchors, canvas.width * 2/8, 0, canvas.width / 8, 150, (e, hoverState) => {
          tab = 'files';
          subtab = 'itm';

          localAssets = _getLocalAssets();
          localAsset = null;
          inventoryBarValue = 0;
          inventoryPage = 0;
          inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;

          _renderMenu();
          assetsMesh.render();

          filesAnchors = _getFilesAnchors();
          plane.anchors = _getAnchors();
        });

        const statusAnchors = [];

        const _getFilesAnchors = () => {
          const result = [];
          _pushAnchor(result, canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05, 30, (canvas.height - 150*2 - 100) * 0.9, (e, hoverState) => {
            if (inventoryPages > 0) {
              const {side} = e;

              onmove = () => {
                const hoverState = uiTracker.getHoverState(side);
                inventoryBarValue = Math.min(Math.max(hoverState.y - (150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05), 0), (canvas.height - 150*2 - 100) * 0.9) / ((canvas.height - 150*2 - 100) * 0.9);
                inventoryPage = _snapToIndex(inventoryPages, inventoryBarValue);
                localAssets = _getLocalAssets();
                localAsset = null;

                _renderMenu();

                filesAnchors = _getFilesAnchors();
                plane.anchors = _getAnchors();
              };
            }
          });
          _pushAnchor(result, canvas.width * 0/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'itm';

            localAssets = _getLocalAssets();
            localAsset = null;
            inventoryBarValue = 0;
            inventoryPage = 0;
            inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;

            _renderMenu();
            assetsMesh.render();

            filesAnchors = _getFilesAnchors();
            plane.anchors = _getAnchors();
          });
          _pushAnchor(result, canvas.width * 1/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'med';

            localAssets = _getLocalAssets();
            localAsset = null;
            inventoryBarValue = 0;
            inventoryPage = 0;
            inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;

            _renderMenu();
            assetsMesh.render();

            filesAnchors = _getFilesAnchors();
            plane.anchors = _getAnchors();
          });
          _pushAnchor(result, canvas.width * 2/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'dat';

            localAssets = _getLocalAssets();
            localAsset = null;
            inventoryBarValue = 0;
            inventoryPage = 0;
            inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;

            _renderMenu();
            assetsMesh.render();

            filesAnchors = _getFilesAnchors();
            plane.anchors = _getAnchors();
          });
          _pushAnchor(result, canvas.width * 3/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'pls';

            localAssets = _getLocalAssets();
            localAsset = null;
            inventoryBarValue = 0;
            inventoryPage = 0;
            inventoryPages = localAssets.length > numFilesPerPage ? Math.ceil(localAssets.length / numFilesPerPage) : 0;

            _renderMenu();
            assetsMesh.render();

            filesAnchors = _getFilesAnchors();
            plane.anchors = _getAnchors();
          });
          const l = Math.min(localAssets.length - inventoryPage * numFilesPerPage, numFilesPerPage);
          for (let i = 0; i < l; i++) {
            _pushAnchor(result, 0, 150*2 + ((canvas.height - 150*2) * i/numFilesPerPage), canvas.width - 640 - 40 - 60, (canvas.height - 150*2) / numFilesPerPage, (e, hoverState) => {
              localAsset = localAssets[inventoryPage * numFilesPerPage + i];

              _renderMenu();
              assetsMesh.render();

              filesAnchors = _getFilesAnchors();
              plane.anchors = _getAnchors();
            });
          }
          if (localAsset) {
            if (localAsset.ext === 'pls') {
              _pushAnchor(result, canvas.width - 640 - 40, 150*2, 640 + 40, 100, (e, hoverState) => {
                const allInstalled = localAsset.playlist.every(playlistEntry => {
                  const {name} = playlistEntry;
                  return world.getTag({
                    type: 'entity',
                    name,
                  });
                });
                if (allInstalled) {
                  for (let i = 0; i < localAsset.playlist.length; i++) {
                    const {name} = localAsset.playlist[i];
                    const tagMesh = world.getTag({
                      type: 'entity',
                      name,
                    });
                    const {item} = tagMesh;
                    const {id} = item;

                    world.removeTag(id);
                  }

                  localMod = null;
                  modReadmeImg = null;
                  if (modReadmeImgPromise) {
                    modReadmeImgPromise.cancel();
                    modReadmeImgPromise = null;
                  }
                  modBarValue = 0;
                  modPage = 0;
                  modPages = 0;
                } else {
                  for (let i = 0; i < localAsset.playlist.length; i++) {
                    const {name, displayName, version} = localAsset.playlist[i];
                    if (!world.getTag({
                      type: 'entity',
                      name,
                    })) {
                      const itemSpec = {
                        type: 'entity',
                        id: _makeId(),
                        name: displayName,
                        displayName,
                        version,
                        module: displayName,
                        tagName: _makeTagName(name),
                        attributes: {},
                        metadata: {},
                      };
                      world.addTag(itemSpec);

                      localMod = null;
                      modReadmeImg = null;
                      if (modReadmeImgPromise) {
                        modReadmeImgPromise.cancel();
                        modReadmeImgPromise = null;
                      }
                      modBarValue = 0;
                      modPage = 0;
                      modPages = 0;
                    }
                  }
                }

                _renderMenu();
              });
            }
          }
          return result;
        };
        let filesAnchors = _getFilesAnchors();

        const _getServerAnchors = () => {
          const result = [];
          _pushAnchor(result, canvas.width - 640 - 40 - 60, 150*2 + (canvas.height - 150*2) * 0.05, 30, (canvas.height - 150*2) * 0.9, (e, hoverState) => {
            if (serverPages > 0) {
              const {side} = e;

              onmove = () => {
                const hoverState = uiTracker.getHoverState(side);
                serverBarValue = Math.min(Math.max(hoverState.y - (150*2 + (canvas.height - 150*2) * 0.05), 0), (canvas.height - 150*2) * 0.9) / ((canvas.height - 150*2) * 0.9);
                serverPage = _snapToIndex(serverPages, serverBarValue);
                localMods = _getLocalMods();

                _renderMenu();

                serverAnchors = _getServerAnchors();
                modAnchors = _getModAnchors();
                plane.anchors = _getAnchors();
              };
            }
          });
          _pushAnchor(result, canvas.width * 0/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'installed';

            localMods = _getLocalMods();
            localMod = null;
            modReadmeImg = null;
            if (modReadmeImgPromise) {
              modReadmeImgPromise.cancel();
              modReadmeImgPromise = null;
            }
            modBarValue = 0;
            modPage = 0;
            modPages = 0;
            serverBarValue = 0;
            serverPage = 0;
            serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 0;

            _renderMenu();

            serverAnchors = _getServerAnchors();
            modAnchors = _getModAnchors();
            plane.anchors = _getAnchors();
          });
          _pushAnchor(result, canvas.width * 1/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'store';

            localMods = _getLocalMods();
            localMod = null;
            modReadmeImg = null;
            if (modReadmeImgPromise) {
              modReadmeImgPromise.cancel();
              modReadmeImgPromise = null;
            }
            modBarValue = 0;
            modPage = 0;
            modPages = 0;
            serverBarValue = 0;
            serverPage = 0;
            serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 0;

            _renderMenu();

            serverAnchors = _getServerAnchors();
            modAnchors = _getModAnchors();
            plane.anchors = _getAnchors();
          });
          _pushAnchor(result, canvas.width * 2/8, 150, canvas.width / 8, 150, (e, hoverState) => {
            subtab = 'local';

            localMods = _getLocalMods();
            localMod = null;
            modReadmeImg = null;
            if (modReadmeImgPromise) {
              modReadmeImgPromise.cancel();
              modReadmeImgPromise = null;
            }
            modBarValue = 0;
            modPage = 0;
            modPages = 0;
            serverBarValue = 0;
            serverPage = 0;
            serverPages = localMods.length > numModsPerPage ? Math.ceil(localMods.length / numModsPerPage) : 0;

            _renderMenu();

            serverAnchors = _getServerAnchors();
            modAnchors = _getModAnchors();
            plane.anchors = _getAnchors();
          });
          const l = Math.min(localMods.length - serverPage * numModsPerPage, numModsPerPage);
          for (let i = 0; i < l; i++) {
            _pushAnchor(result, 0, 150*2 + ((canvas.height - 150*2) * i/numModsPerPage), canvas.width - 640 - 40 - 60, (canvas.height - 150*2) / numModsPerPage, (e, hoverState) => {
              localMod = localMods[serverPage * numModsPerPage + i];
              modReadmeImg = null;
              if (modReadmeImgPromise) {
                modReadmeImgPromise.cancel();
                modReadmeImgPromise = null;
              }
              modReadmeImgPromise = _requestModReadme(localMod.name, localMod.version);
              modReadmeImgPromise.then(img => {
                modReadmeImg = img;
                modReadmeImgPromise = null;

                modBarValue = 0;
                modPage = 0;
                modPages = img.height > (canvas.height - 150*2) ? Math.ceil(img.height / (canvas.height - 150*2)) : 0;

                _renderMenu();
                plane.anchors = _getAnchors();
              });
              modBarValue = 0;
              modPage = 0;
              modPages = 0;
              modAnchors = _getModAnchors();

              _renderMenu();
              assetsMesh.render();

              plane.anchors = _getAnchors();
            });
          }
          return result;
        };
        let serverAnchors = _getServerAnchors();

        const _getModAnchors = () => {
          const result = serverAnchors.slice();

          _pushAnchor(result, canvas.width - 60, 150*2 + 100 + (canvas.height - 150*2 - 100) * 0.05, 30, (canvas.height - 150*2 - 100) * 0.9, (e, hoverState) => {
            if (modPages > 0) {
              const {side} = e;

              onmove = () => {
                const hoverState = uiTracker.getHoverState(side);
                modBarValue = Math.min(Math.max(hoverState.y - (150*2 + (canvas.height - 150*2) * 0.05), 0), (canvas.height - 150*2) * 0.9) / ((canvas.height - 150*2) * 0.9);
                modPage = _snapToIndex(modPages, modBarValue);

                _renderMenu();
              };
            }
          });

          _pushAnchor(result, canvas.width - 640 - 40, 150*2, 640 + 40, 100, (e, hoverState) => {
            const {name, displayName, version} = localMod;

            if (localMod.installed) {
              const tagMesh = world.getTag({
                type: 'entity',
                name: displayName,
              });
              const {item} = tagMesh;
              const {id} = item;
              world.removeTag(id);

              localMod = null;
              modReadmeImg = null;
              if (modReadmeImgPromise) {
                modReadmeImgPromise.cancel();
                modReadmeImgPromise = null;
              }
              modBarValue = 0;
              modPage = 0;
              modPages = 0;

              _updateInstalled();
              _renderMenu();
            } else {
              const itemSpec = {
                type: 'entity',
                id: _makeId(),
                name: displayName,
                displayName,
                version,
                module: displayName,
                tagName: _makeTagName(name),
                attributes: {},
                metadata: {},
              };
              world.addTag(itemSpec);

              localMod = null;
              modReadmeImg = null;
              if (modReadmeImgPromise) {
                modReadmeImgPromise.cancel();
                modReadmeImgPromise = null;
              }
              modBarValue = 0;
              modPage = 0;
              modPages = 0;

              _updateInstalled();
              _renderMenu();
            }
          });

          return result;
        };
        let modAnchors = _getModAnchors(); */

        let focusState = {};
        const itemMenuState = {
          focus: null,
          barValue: 0,
          page: 0,
        };
        const _setFocus = newFocusState => {
          focusState = newFocusState;

          _renderMenu();
          planeMeshLeft.render();
          planeLeft.updateAnchors();
          planeMeshRight.render();
          planeRight.updateAnchors();
          assetsMesh.render();
          plane.anchors = _getAnchors();
        };

        class InventoryAssetInstance {
          constructor(item) {
            this.item = item;
          }

          setAttribute(name, value) {
            const _setAttribute = (attributes, name, value) => {
              const attributeSpec = attributes[name];
              if (!attributeSpec) {
                attributeSpec.json.data.attributes[name] = {
                  value,
                };
              } else {
                attributeSpec.value = value;
              }
            };

            _setAttribute(this.item.json.data.attributes, name, value);

            vridApi.get('assets')
              .then(assets => {
                assets = assets || [];

                const assetSpec = assets.find(assetSpec => assetSpec.id === this.item.id);
                _setAttribute(assetSpec.json.data.attributes, name, value);

                return vridApi.set('assets', assets);
              })
              .catch(err => {
                console.warn(err);
              });
          }
        }

        const _getAnchors = () => {
          const result = [];

          if (focusState.type === 'leftPane' || focusState.type === 'rightPane') {
            _pushAnchor(result, ITEM_MENU_BORDER_SIZE, 150, fontSize*2 + ITEM_MENU_BORDER_SIZE, fontSize*2 + ITEM_MENU_BORDER_SIZE, (e, hoverState) => {
              _setFocus({});
            });
            _pushAnchor(result, ITEM_MENU_INNER_SIZE - fontSize*2, 150, fontSize*2 + ITEM_MENU_BORDER_SIZE, fontSize*2 + ITEM_MENU_BORDER_SIZE, (e, hoverState) => {
              if (focusState.type === 'leftPane') {
                wallet.destroyItem(focusState.target);

                _setFocus({});
              } else if (focusState.type === 'rightPane') {
                const {target} = focusState;

                assets.splice(assets.findIndex(assetSpec => assetSpec.id === target.id), 1);

                vridApi.get('assets')
                  .then(assets => {
                    assets = assets || [];
                    assets.splice(assets.findIndex(assetSpec => assetSpec.id === target.id), 1);

                    return vridApi.set('assets', assets);
                  })
                  .catch(err => {
                    console.warn(err);
                  });

                _setFocus({});
              }
            });

            const {target} = focusState;
            const {ext} = target;
            if (ext === 'itm') {
              const {json} = target;

              if (json && json.data && json.data.attributes && typeof json.data.path === 'string') {
                const path = json.data.path;
                const match = path.match(/^(.+?)\/(.+?)$/);

                if (match) {
                  const moduleName = match[1];
                  const itemName = match[2];
                  const module = remoteMods.find(moduleSpec => moduleSpec.name === moduleName);

                  if (module) {
                    const item = module.metadata.items.find(itemSpec => itemSpec.type === itemName);

                    if (item) {
                      const attributes = (json && json.data && json.data.attributes && typeof json.data.attributes === 'object' && !Array.isArray(json.data.attributes)) ?
                        json.data.attributes
                        : {};
                      const {attributes: attributeSpecs} = item;

                      getAttributesAnchors(result, attributes, attributeSpecs, fontSize, ITEM_MENU_BORDER_SIZE, 150 + fontSize*2, ITEM_MENU_BORDER_SIZE, ITEM_MENU_BORDER_SIZE, itemMenuState, {
                        focusAttribute: ({name: attributeName, type, newValue}) => {
                          const grabbable = (() => {
                            if (focusState.type === 'leftPane') {
                              return wallet.getAssetInstances().find(assetInstance => assetInstance.assetId === target.assetId);
                            } else if (focusState.type === 'rightPane') {
                              return new InventoryAssetInstance(target);
                            } else {
                              return null;
                            }
                          })();
                          // console.log('focus attribute', item, grabbable, attributeName, newValue);
                          if (type === 'number') {
                            grabbable.setAttribute(attributeName, newValue);
                            // grabbable.assetId = _getAssetId();

                            itemMenuState.focus = null;
                          } else if (type === 'select') {
                            if (newValue !== undefined) {
                              grabbable.setAttribute(attributeName, newValue);
                              // grabbable.assetId = _getAssetId();

                              itemMenuState.focus = null;
                            } else {
                              itemMenuState.focus = attributeName;
                            }
                          } else if (type === 'color') {
                            if (newValue !== undefined) {
                              grabbable.setAttribute(attributeName, newValue);
                              // grabbable.assetId = _getAssetId();

                              itemMenuState.focus = null;
                            } else {
                              itemMenuState.focus = attributeName;
                            }
                          } else if (type === 'checkbox') {
                            grabbable.setAttribute(attributeName, newValue);
                            // grabbable.assetId = _getAssetId();

                            itemMenuState.focus = null;
                          } else {
                            itemMenuState.focus = null;
                          }

                          _renderMenu();
                          plane.anchors = _getAnchors();
                        },
                        update: () => {
                          _renderMenu();
                          plane.anchors = _getAnchors();
                        },
                      });
                    }
                  }
                }
              }
            }
          }
          return result;
        };
        plane.anchors = _getAnchors();
        menuMesh.add(plane);
        uiTracker.addPlane(plane);

        /* const lensMesh = (() => {
          const object = new THREE.Object3D();
          // object.position.set(0, 0, 0);

          const width = window.innerWidth * window.devicePixelRatio / 4;
          const height = window.innerHeight * window.devicePixelRatio / 4;
          const renderTarget = _makeRenderTarget(width, height);
          const render = (() => {
            const blurShader = {
              uniforms: THREE.UniformsUtils.clone(THREEBlurShader.uniforms),
              vertexShader: THREEBlurShader.vertexShader,
              fragmentShader: THREEBlurShader.fragmentShader,
            };

            const composer = new THREEEffectComposer(renderer, renderTarget);
            const renderPass = new THREERenderPass(scene, camera);
            composer.addPass(renderPass);
            const blurPass = new THREEShaderPass(blurShader);
            composer.addPass(blurPass);
            composer.addPass(blurPass);
            composer.addPass(blurPass);

            return (scene, camera) => {
              renderPass.scene = scene;
              renderPass.camera = camera;

              composer.render();
              renderer.setRenderTarget(null);
            };
          })();
          object.render = render;

          const planeMesh = (() => {
            const geometry = new THREE.SphereBufferGeometry(3, 8, 6);
            const material = (() => {
              const shaderUniforms = THREE.UniformsUtils.clone(LENS_SHADER.uniforms);
              const shaderMaterial = new THREE.ShaderMaterial({
                uniforms: shaderUniforms,
                vertexShader: LENS_SHADER.vertexShader,
                fragmentShader: LENS_SHADER.fragmentShader,
                side: THREE.BackSide,
                transparent: true,
              })
              shaderMaterial.uniforms.textureMap.value = renderTarget.texture;
              // shaderMaterial.polygonOffset = true;
              // shaderMaterial.polygonOffsetFactor = -1;
              return shaderMaterial;
            })();

            const mesh = new THREE.Mesh(geometry, material);
            return mesh;
          })();
          object.add(planeMesh);
          object.planeMesh = planeMesh;

          return object;
        })();
        menuMesh.add(lensMesh); */

        const _makePlaneMesh = (width, height, texture) => {
          const geometry = new THREE.PlaneBufferGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5,
            // renderOrder: -1,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.frustumCulled = false;
          return mesh;
        };
        const planeMesh = _makePlaneMesh(WORLD_WIDTH, WORLD_HEIGHT, texture);
        menuMesh.add(planeMesh);

        const planeMeshLeft = (() => {
          const canvas = document.createElement('canvas');
          canvas.width = WIDTH;
          canvas.height = HEIGHT;
          const ctx = canvas.getContext('2d')

          const texture = new THREE.Texture(
            canvas,
            THREE.UVMapping,
            THREE.ClampToEdgeWrapping,
            THREE.ClampToEdgeWrapping,
            THREE.NearestFilter,
            THREE.NearestFilter,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
          );
          texture.needsUpdate = true;

          const planeMeshLeft = _makePlaneMesh(WORLD_WIDTH, WORLD_HEIGHT, texture);
          const s = Math.sqrt(Math.pow(WORLD_WIDTH, 2) / 2);
          planeMeshLeft.position.set(-WORLD_WIDTH/2 - s/2, 0, s/2);
          planeMeshLeft.quaternion.setFromAxisAngle(localVector.set(0, 1, 0), Math.PI/4);
          planeMeshLeft.updateMatrixWorld();

          const _render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#FFF';
            // ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#EEE';
            ctx.fillRect(0, 0, canvas.width, 150);

            ctx.fillStyle = '#111';
            ctx.font = `${fontSize*1.6}px Open sans`;
            ctx.fillText('Server', 60, fontSize*2 + 35);

            /* for (let y = 0; y < 4; y++) {
              for (let x = 0; x < 5; x++) {
                ctx.drawImage(boxImg, x * canvas.width/6, 150 + y * canvas.width/6, canvas.width/6, canvas.width/6);
              }
            }

            ctx.font = `${fontSize}px Open sans`;

            let numMenuAssets = 0;
            const assetInstances = wallet.getAssetInstances();
            for (let i = 0; i < assetInstances.length; i++) {
              const assetInstance = assetInstances[i];

              if (!assetInstance.owner) {
                numMenuAssets++;

                ctx.clearRect(0, 150 + (i+1) * canvas.width/6 - 20 - fontSize, canvas.width, fontSize*2);
                ctx.fillText(`${assetInstance.name}.${assetInstance.ext}`, canvas.width/6*0.1, 150 + (i+1) * canvas.width/6 - 20);
              }
            } */

            if (focusState.type === 'grab' && SIDES.some(side => focusState.targets[side] && focusState.targets[side].ext === 'wld')) {
              const boxPath = _roundedRectanglePath({
                left: 50,
                top: 150 + 50,
                width: canvas.width - 50*2,
                height: canvas.height - 150 - 50*2,
                borderRadius: 20,
              });
              ctx.lineWidth = 10;
              ctx.strokeStyle = '#EEE';
              ctx.stroke(boxPath);

              ctx.font = `100px Open sans`;

              ctx.fillText('Load world', canvas.width/2 - ctx.measureText('Load world').width/2, canvas.height/2 + 100/2);
            } else {
              const unownedAssetInstances = wallet.getAssetInstances().filter(assetInstance => !assetInstance.owner);
              ctx.font = `50px Open sans`;
              /* ctx.strokeStyle = '#EEE';
              ctx.lineWidth = 10; */
              const startI = planeLeftState.page * 7;
              for (let i = startI; i < unownedAssetInstances.length; i++) {
                const assetInstance = unownedAssetInstances[i];
                const di = i - startI;
                if (focusState.type === 'leftPane' && focusState.target.assetId === assetInstance.assetId) {
                  ctx.fillStyle = '#111';
                  ctx.fillRect(0, 150 + di * (canvas.height-150)/7, canvas.width - 200, (canvas.height-150)/7);
                  ctx.fillStyle = '#FFF';
                } else {
                  ctx.fillStyle = '#111';
                }
                /* ctx.beginPath();
                ctx.moveTo(0, 150 + (i+1) * (canvas.height / 8));
                ctx.lineTo(canvas.width - 200, 150 + (i+1) * (canvas.height / 8));
                ctx.stroke(); */

                const boxPath = _roundedRectanglePath({
                  left: 50,
                  top: 150 + di * (canvas.height-150)/7 + 20,
                  width: (canvas.height-150)/7 - 20,
                  height: (canvas.height-150)/7 - 20 - 20,
                  borderRadius: 20,
                });
                ctx.lineWidth = 10;
                ctx.strokeStyle = '#EEE';
                ctx.stroke(boxPath);
                // ctx.drawImage(boxImg, 50, 150 + i * (canvas.height-150)/7 - 20, (canvas.height-150)/7 + 40, (canvas.height-150)/7 + 40);

                // ctx.clearRect(0, 150 + (i+1) * canvas.width/6 - 20 - fontSize, canvas.width, fontSize*2);
                ctx.fillText(`${assetInstance.name}.${assetInstance.ext}`, 300, 150 + (di+1) * (canvas.height-150)/7 - 75);
              }

              const barSize = 80;
              const numPages = Math.max(Math.ceil(unownedAssetInstances.length / 7), 1);
              ctx.fillStyle = '#CCC';
              ctx.fillRect(canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2);
              if (numPages > 1) {
                ctx.fillStyle = '#ff4b4b';
                ctx.fillRect(
                  canvas.width - 150 + (barSize-30)/2, 150 + barSize + _snapToPixel(canvas.height - 150 - barSize*2, numPages, planeLeftState.barValue),
                  30, (canvas.height - 150 - barSize*2) / numPages
                );
              }
              ctx.drawImage(arrowUpImg, canvas.width - 150, 150, barSize, barSize);
              ctx.drawImage(arrowDownImg, canvas.width - 150, canvas.height - barSize, barSize, barSize);
            }

            const boxPath = _roundedRectanglePath({
              left: canvas.width - 450,
              top: 35,
              width: 300 - 30,
              height: 150 - 35*2,
              borderRadius: (150 - 35*2)/2 + 4,
            });
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#111';
            ctx.stroke(boxPath);

            ctx.fillStyle = '#111';
            ctx.font = `${fontSize}px Open sans`;
            ctx.fillText('Save world', canvas.width - 450 + (300 - 30)/2 - ctx.measureText('Save world').width/2, 150/2 + fontSize/2*0.9);

            // ctx.fillText('Pack world', 5 * canvas.width/6 + canvas.width/6*0.1, 150 + (0+1) * canvas.width/6 - 20);

            texture.needsUpdate = true;
          };
          planeMeshLeft.render = _render;

          return planeMeshLeft;
        })();
        menuMesh.add(planeMeshLeft);
        const planeLeft = new THREE.Object3D();
        planeLeft.visible = false;
        planeLeft.position.copy(planeMeshLeft.position);
        planeLeft.quaternion.copy(planeMeshLeft.quaternion);
        planeLeft.scale.copy(planeMeshLeft.scale);
        planeLeft.updateMatrixWorld();
        // planeLeft.visible = false;
        planeLeft.width = WIDTH;
        planeLeft.height = HEIGHT;
        planeLeft.worldWidth = WORLD_WIDTH;
        planeLeft.worldHeight = WORLD_HEIGHT;
        planeLeft.open = false;
        planeLeft.anchors = [];
        planeLeft.updateAnchors = () => {
          const result = [];

          if (focusState.type === 'grab' && SIDES.some(side => focusState.targets[side] && focusState.targets[side].ext === 'wld')) {
            _pushAnchor(result, 50, 150 + 50, canvas.width - 50*2, canvas.height - 150 - 50*2, e => {
              const {side} = e;
              const {targets} = focusState;
              const target = targets[side];

              if (target) {
                console.log('load world'); // XXX
              }
            });
          } else {
            const unownedAssetInstances = wallet.getAssetInstances().filter(assetInstance => !assetInstance.owner);
            const startI = planeLeftState.page * 7;
            for (let i = startI; i < unownedAssetInstances.length; i++) {
              const di = i - startI;

              _pushAnchor(result, 0, 150 + di * (canvas.height-150)/7, canvas.width - 200, (canvas.height-150)/7, e => {
                const {side} = e;
                const target = unownedAssetInstances[i];

                if (webvr.getStatus().gamepads[side].buttons.grip.pressed) {
                  const grabbable = wallet.getAssetInstances().find(assetInstance => assetInstance.assetId === target.assetId);
                  grabbable.grab(side);
                } else {
                  if (target) {
                    if (focusState.type === 'leftPane' && focusState.target.assetId === target.assetId) {
                      _setFocus({});
                    } else {
                      menuState.barValue = 0;
                      menuState.page = 0;

                      _setFocus({
                        type: 'leftPane',
                        target,
                      });
                    }
                  }
                }
              });
            }

            const barSize = 80;
            const numPages = Math.ceil(unownedAssetInstances.length / 7);
            _pushAnchor(result, canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2, e => {
              if (numPages > 0) {
                const {side} = e;

                onmove = () => {
                  const hoverState = uiTracker.getHoverState(side);
                  planeLeftState.barValue = Math.min(Math.max(hoverState.y - (150 + barSize), 0), canvas.height - 150 - barSize*2) / (canvas.height - 150 - barSize*2);
                  const {page: oldPage} = planeLeftState;
                  const newPage = _snapToIndex(numPages, planeLeftState.barValue);

                  if (newPage !== oldPage) {
                    planeLeftState.page = newPage;

                    planeMeshLeft.render();
                    planeLeft.updateAnchors();
                    assetsMesh.render();
                  }
                };
              }
            });
            _pushAnchor(result, canvas.width - 150, 150, barSize, barSize, e => {
              const {page: oldPage} = planeLeftState;
              const newPage = Math.max(planeLeftState.page - 1, 0);

              if (newPage !== oldPage) {
                planeLeftState.page = newPage;
                planeLeftState.barValue = planeLeftState.page / (numPages - 1);

                planeMeshLeft.render();
                planeLeft.updateAnchors();
                assetsMesh.render();
              }
            });
            _pushAnchor(result, canvas.width - 150, canvas.height - barSize, barSize, barSize, e => {
              const {page: oldPage} = planeLeftState;
              const newPage = Math.min(planeLeftState.page + 1, numPages - 1);

              if (newPage !== oldPage) {
                planeLeftState.page = newPage;
                planeLeftState.barValue = planeLeftState.page / (numPages - 1);

                planeMeshLeft.render();
                planeLeft.updateAnchors();
                assetsMesh.render();
              }
            });
          }

          _pushAnchor(result, canvas.width - 450, 35, 300 - 30, 150 - 35*2, e => {
            Promise.all([
              vrid.get('name'),
              vrid.get('assets'),
              fetch('archae/config/config.json', {
                credentials: 'include',
              })
                .then(res => res.json()),
            ])
              .then(([
                username,
                localAssets,
                serverConfig,
              ]) => {
                assets = assets || [];

                const {name} = serverConfig;
                const ext = 'wld';
                const assetSpec = {
                  id: _makeId(),
                  name,
                  ext,
                  json: {
                    data: {
                      items: wallet.getAssetInstances().filter(assetInstance => !assetInstance.owner).map(({
                        assetId,
                        id,
                        name,
                        ext,
                        json = null,
                        file = null,
                        owner,
                        physics,
                        visible,
                        open,
                        position,
                        rotation,
                        scale,
                      }) => ({
                        assetId,
                        id,
                        name,
                        ext,
                        json,
                        file,
                        owner,
                        physics,
                        visible,
                        open,
                        matrix: position.toArray().concat(rotation.toArray()).concat(scale.toArray()),
                      })),
                    },
                  },
                  owner: username,
                  timestamp: Date.now(),
                };
                assets.push(assetSpec);

                return vrid.set('assets', assets)
                  .then(() => assetSpec);
              })
              .then(assetSpec => {
                sfx.drop.trigger();

                planeMeshRight.render();
                planeRight.updateAnchors();
                assetsMesh.render();

                const newNotification = notification.addNotification(`Saved world to "${assetSpec.name}.${assetSpec.ext}"`);
                setTimeout(() => {
                  notification.removeNotification(newNotification);
                }, 3000);
              })
              .catch(err => {
                console.warn(err);
              });
          });

          planeLeft.anchors = result;
        };

        planeLeft.updateAnchors();
        menuMesh.add(planeLeft);
        uiTracker.addPlane(planeLeft);

        const planeMeshRight = (() => {
          const canvas = document.createElement('canvas');
          canvas.width = WIDTH;
          canvas.height = HEIGHT;
          const ctx = canvas.getContext('2d');

          const texture = new THREE.Texture(
            canvas,
            THREE.UVMapping,
            THREE.ClampToEdgeWrapping,
            THREE.ClampToEdgeWrapping,
            THREE.NearestFilter,
            THREE.NearestFilter,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
          );
          texture.needsUpdate = true;

          const planeMeshRight = _makePlaneMesh(WORLD_WIDTH, WORLD_HEIGHT, texture);
          const s = Math.sqrt(Math.pow(WORLD_WIDTH, 2) / 2);
          planeMeshRight.position.set(WORLD_WIDTH/2 + s/2, 0, s/2);
          planeMeshRight.quaternion.setFromAxisAngle(localVector.set(0, 1, 0), -Math.PI/4);
          planeMeshRight.updateMatrixWorld();

          const _render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // ctx.fillStyle = '#FFF';
            // ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#EEE';
            ctx.fillRect(0, 0, canvas.width, 150);

            ctx.fillStyle = '#111';
            ctx.font = `${fontSize*1.6}px Open sans`;
            ctx.fillText('Inventory', 60, fontSize*2 + 35);

            if (focusState.type === 'grab') {
              const boxPath = _roundedRectanglePath({
                left: 50,
                top: 150 + 50,
                width: canvas.width - 50*2,
                height: canvas.height - 150 - 50*2,
                borderRadius: 20,
              });
              ctx.lineWidth = 10;
              ctx.strokeStyle = '#EEE';
              ctx.stroke(boxPath);

              ctx.font = `100px Open sans`;

              ctx.fillText('Drop zone', canvas.width/2 - ctx.measureText('Drop zone').width/2, canvas.height/2 + 100/2);
            } else {
              ctx.font = `50px Open sans`;

              const assetInstances = assets;
              ctx.font = `50px Open sans`;
              /* ctx.strokeStyle = '#EEE';
              ctx.lineWidth = 10; */
              const startI = planeRightState.page * 7;
              for (let i = startI; i < assetInstances.length; i++) {
                const assetInstance = assetInstances[i];
                const di = i - startI;
                if (focusState.type === 'rightPane' && focusState.target.id === assetInstance.id) {
                  ctx.fillStyle = '#111';
                  ctx.fillRect(0, 150 + di * (canvas.height-150)/7, canvas.width - 200, (canvas.height-150)/7);
                  ctx.fillStyle = '#FFF';
                } else {
                  ctx.fillStyle = '#111';
                }

                /* ctx.beginPath();
                ctx.moveTo(0, 150 + (i+1) * (canvas.height / 8));
                ctx.lineTo(canvas.width - 200, 150 + (i+1) * (canvas.height / 8));
                ctx.stroke(); */

                const boxPath = _roundedRectanglePath({
                  left: 50,
                  top: 150 + di * (canvas.height-150)/7 + 20,
                  width: (canvas.height-150)/7 - 20,
                  height: (canvas.height-150)/7 - 20 - 20,
                  borderRadius: 20,
                });
                ctx.lineWidth = 10;
                ctx.strokeStyle = '#EEE';
                ctx.stroke(boxPath);
                // ctx.drawImage(boxImg, 50, 150 + i * (canvas.height-150)/7 - 20, (canvas.height-150)/7 + 40, (canvas.height-150)/7 + 40);

                // ctx.clearRect(0, 150 + (i+1) * canvas.width/6 - 20 - fontSize, canvas.width, fontSize*2);
                ctx.fillText(`${assetInstance.name}.${assetInstance.ext}`, 300, 150 + (di+1) * (canvas.height-150)/7 - 75);
              }

              const barSize = 80;
              const numPages = Math.max(Math.ceil(assetInstances.length / 7), 1);
              ctx.fillStyle = '#CCC';
              ctx.fillRect(canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2);
              if (numPages > 1) {
                ctx.fillStyle = '#ff4b4b';
                ctx.fillRect(
                  canvas.width - 150 + (barSize-30)/2, 150 + barSize + _snapToPixel(canvas.height - 150 - barSize*2, numPages, planeRightState.barValue),
                  30, (canvas.height - 150 - barSize*2) / numPages
                );
              }
              ctx.drawImage(arrowUpImg, canvas.width - 150, 150, barSize, barSize);
              ctx.drawImage(arrowDownImg, canvas.width - 150, canvas.height - barSize, barSize, barSize);

              /* ctx.fillText('Save', 5.25 * canvas.width/6, 150 + 425);
              ctx.fillText('Remove', 5.25 * canvas.width/6, 150 + 850); */
            }

            texture.needsUpdate = true;
          };
          planeMeshRight.render = _render;

          return planeMeshRight;
        })();
        menuMesh.add(planeMeshRight);
        const planeRight = new THREE.Object3D();
        planeRight.visible = false;
        planeRight.position.copy(planeMeshRight.position);
        planeRight.quaternion.copy(planeMeshRight.quaternion);
        planeRight.scale.copy(planeMeshRight.scale);
        planeRight.updateMatrixWorld();
        // planeRight.visible = false;
        planeRight.width = WIDTH;
        planeRight.height = HEIGHT;
        planeRight.worldWidth = WORLD_WIDTH;
        planeRight.worldHeight = WORLD_HEIGHT;
        planeRight.open = false;
        planeRight.anchors = [];
        planeRight.updateAnchors = () => {
          const result = [];

          if (focusState.type === 'grab') {
            _pushAnchor(result, 50, 150 + 50, canvas.width - 50*2, canvas.height - 150 - 50*2, e => {
              const {side} = e;
              const {targets} = focusState;
              const target = targets[side];

              if (target) {
                wallet.storeItem(target);

                const targets = {
                  left: focusState.targets.left,
                  right: focusState.targets.right,
                };
                targets[e.side] = null;
                if (targets.left || targets.right) {
                  _setFocus({
                    type: 'grab',
                    targets,
                  });
                } else {
                  _setFocus({});
                }
              }
            });
          } else {
            const assetInstances = assets;
            const startI = planeRightState.page * 7;
            for (let i = startI; i < assetInstances.length; i++) {
              const di = i - startI;

              _pushAnchor(result, 0, 150 + di * (canvas.height-150)/7, canvas.width - 200, (canvas.height-150)/7, e => {
                const {side} = e;
                const target = assets[i];

                if (webvr.getStatus().gamepads[side].buttons.grip.pressed) {
                  wallet.pullItem(target, side);

                  planeMeshRight.render();
                  assetsMesh.render();
                } else {
                  if (target) {
                    if (focusState.type === 'rightPane' && focusState.target.id === target.id) {
                      _setFocus({});
                    } else {
                      menuState.barValue = 0;
                      menuState.page = 0;

                      _setFocus({
                        type: 'rightPane',
                        target,
                      });
                    }
                  }
                }
              });
            }

            const barSize = 80;
            const numPages = Math.ceil(assetInstances.length / 7);
            _pushAnchor(result, canvas.width - 150 + (barSize-30)/2, 150 + barSize, 30, canvas.height - 150 - barSize*2, e => {
              if (numPages > 0) {
                const {side} = e;

                onmove = () => {
                  const hoverState = uiTracker.getHoverState(side);
                  planeRightState.barValue = Math.min(Math.max(hoverState.y - (150 + barSize), 0), canvas.height - 150 - barSize*2) / (canvas.height - 150 - barSize*2);
                  const {page: oldPage} = planeRightState;
                  const newPage = _snapToIndex(numPages, planeRightState.barValue);

                  if (newPage !== oldPage) {
                    planeRightState.page = newPage;

                    planeMeshRight.render();
                    planeRight.updateAnchors();
                    assetsMesh.render();
                  }
                };
              }
            });
            _pushAnchor(result, canvas.width - 150, 150, barSize, barSize, e => {
              const {page: oldPage} = planeRightState;
              const newPage = Math.max(planeRightState.page - 1, 0);

              if (newPage !== oldPage) {
                planeRightState.page = newPage;
                planeRightState.barValue = planeRightState.page / (numPages - 1);

                planeMeshRight.render();
                planeRight.updateAnchors();
                assetsMesh.render();
              }
            });
            _pushAnchor(result, canvas.width - 150, canvas.height - barSize, barSize, barSize, e => {
              const {page: oldPage} = planeRightState;
              const newPage = Math.min(planeRightState.page + 1, numPages - 1);

              if (newPage !== oldPage) {
                planeRightState.page = newPage;
                planeRightState.barValue = planeRightState.page / (numPages - 1);

                planeMeshRight.render();
                planeRight.updateAnchors();
                assetsMesh.render();
              }
            });
          }

          planeRight.anchors = result;
        };
        planeRight.updateAnchors();
        menuMesh.add(planeRight);
        uiTracker.addPlane(planeRight);

        const {dotMeshes, boxMeshes} = uiTracker;
        for (let i = 0; i < SIDES.length; i++) {
          const side = SIDES[i];
          scene.add(dotMeshes[side]);
          scene.add(boxMeshes[side]);
        }

        /* (() => {
          const assetInstances = wallet.getAssetInstances();
          for (let i = 0; i < assetInstances.length; i++) {
            const assetInstance = assetInstances[i];
            if (assetInstance.open) {
              _walletMenuOpen(assetInstance);
            }
          }
        })(); */

        const assetsMesh = (() => {
          const geometry = (() => {
            const geometry = new THREE.BufferGeometry();

            geometry.boundingSphere = new THREE.Sphere(
              zeroVector,
              1
            );
            const cleanups = [];
            geometry.destroy = () => {
              for (let i = 0; i < cleanups.length; i++) {
                cleanups[i]();
              }
            };

            return geometry;
          })();
          const material = assetsMaterial;
          const mesh = new THREE.Mesh(geometry, material);
          mesh.frustumCulled = false;
          const _renderAssets = _debounce(next => {
            const s = Math.sqrt(Math.pow(WORLD_WIDTH, 2) / 2);
            const promises = [
              /* _requestImageData('/archae/plugins/_core_engines_inventory/serve/up.png')
                .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                  localVector.set(
                    WORLD_WIDTH / 2 + s - pixelSize * 16,
                    WORLD_HEIGHT / 2 - pixelSize * 16 * 2,
                    s
                  ),
                  zeroQuaternion,
                  oneVector
                ))),
              _requestImageData('/archae/plugins/_core_engines_inventory/serve/x.png')
                .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                  localVector.set(
                    WORLD_WIDTH / 2 + s - pixelSize * 16,
                    WORLD_HEIGHT / 2 - pixelSize * 16 * 2 - pixelSize * 16 * 2,
                    s
                  ),
                  zeroQuaternion,
                  oneVector
                ))),
              _requestImageData('/archae/plugins/_core_engines_inventory/serve/earth-box.png')
                .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                  localVector.set(
                    -WORLD_WIDTH / 2,
                    WORLD_HEIGHT / 2 - 150*WORLD_HEIGHT/HEIGHT - pixelSize * 16,
                    pixelSize * 16
                  ),
                  zeroQuaternion,
                  oneVector
                ))), */
            ].concat((() => {
              const _renderAssetMesh = matrix => (assetSpec, i) => {
                const _requestAssetImageData = () => {
                  const type = _normalizeType(assetSpec.ext);
                  if (type === 'itm') {
                    if (assetSpec.json && assetSpec.json.data && assetSpec.json.data.icon && typeof assetSpec.json.data.icon === 'string') {
                      return _requestImageData('data:application/octet-stream;base64,' + assetSpec.json.data.icon);
                    } else {
                      return Promise.resolve(_cloneImageData(fileImgData));
                    }
                  } else if (type === 'med') {
                    if (isImageType(assetSpec.ext)) {
                      return Promise.resolve(_cloneImageData(imageImgData));
                    } else if (isAudioType(assetSpec.ext)) {
                      return Promise.resolve(_cloneImageData(audioImgData));
                    } else if (isVideoType(assetSpec.ext)) {
                      return Promise.resolve(_cloneImageData(videoImgData));
                    } else if (isModelType(assetSpec.ext)) {
                      return Promise.resolve(_cloneImageData(modelImgData));
                    } else {
                      return Promise.resolve(_cloneImageData(fileImgData));
                    }
                  } else {
                    return Promise.resolve(_cloneImageData(fileImgData));
                  }
                };
                return _requestAssetImageData()
                  .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                    localVector.set(
                      -WORLD_WIDTH/2 + (50 + (canvas.height-150)/7/2) * WORLD_WIDTH/WIDTH,
                      WORLD_HEIGHT/2 - (150 + (i + 0.5) * (canvas.height-150)/7) * WORLD_HEIGHT/HEIGHT,
                      pixelSize*16/2
                    )
                      .applyMatrix4(matrix),
                    zeroQuaternion,
                    oneVector
                  )));
              };

              return (
                (focusState.type === 'grab' && SIDES.some(side => focusState.targets[side] && focusState.targets[side].ext === 'wld')) ?
                    []
                  :
                    wallet.getAssetInstances()
                      .filter(assetInstance => !assetInstance.owner)
                      .slice(planeLeftState.page * 7, (planeLeftState.page+1) * 7)
                      .map(_renderAssetMesh(planeLeft.matrix))
                )
                  .concat(
                    focusState.type === 'grab' ?
                      []
                    :
                      assets
                        .slice(planeRightState.page * 7, (planeRightState.page+1) * 7)
                        .map(_renderAssetMesh(planeRight.matrix))
                  );
            })());

            /* const promises = (() => {
              if (tab === 'mods' && subtab === 'installed' && localMod) {
                if (localMod.metadata && localMod.metadata.items && Array.isArray(localMod.metadata.items) && localMod.metadata.items.length > 0) {
                  return [
                    resource.getModFileImage(localMod.displayName, 0)
                      .then(image => {
                        localImage = base64.encode(image);

                        return _requestImageData('data:application/octet-stream;base64,' + localImage)
                          .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                            localVector.set(
                              WORLD_WIDTH / 2 - pixelSize * 16 - pixelSize * 16*0.75,
                              -WORLD_HEIGHT / 2 + pixelSize * 16,
                              pixelSize * 16/2
                            ),
                            zeroQuaternion,
                            oneVector
                          )));
                      }),
                  ];
                } else {
                  return [];
                }
              } else if (tab === 'files' && localAsset) {
                if (!SIDES.some(side => Boolean(hand.getGrabbedGrabbable(side)))) {
                  return [
                    _requestAssetImageData(localAsset)
                      .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                        localVector.set(
                          WORLD_WIDTH / 2 - pixelSize * 16 - pixelSize * 16*0.75,
                          -WORLD_HEIGHT / 2 + pixelSize * 16,
                          pixelSize * 16/2
                        ),
                        zeroQuaternion,
                        oneVector
                      ))),
                  ];
                } else {
                  return [
                    _requestImageData('/archae/plugins/_core_engines_inventory/serve/up.png')
                      .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                        localVector.set(
                          WORLD_WIDTH / 2 - pixelSize * 16 - pixelSize * 16*1.5,
                          -WORLD_HEIGHT / 2 + pixelSize * 16,
                          pixelSize * 16/2
                        ),
                        zeroQuaternion,
                        oneVector
                      ))),
                    _requestImageData('/archae/plugins/_core_engines_inventory/serve/x.png')
                      .then(imageData => spriteUtils.requestSpriteGeometry(imageData, pixelSize, localMatrix.compose(
                        localVector.set(
                          WORLD_WIDTH / 2 - pixelSize * 16,
                          -WORLD_HEIGHT / 2 + pixelSize * 16,
                          pixelSize * 16/2
                        ),
                        zeroQuaternion,
                        oneVector
                      ))),
                  ];
                }
              } else {
                return [];
              }
            })(); */
            Promise.all(promises)
              .then(geometrySpecs => {
                const positions = new Float32Array(NUM_POSITIONS);
                const colors = new Float32Array(NUM_POSITIONS);
                const dys = new Float32Array(NUM_POSITIONS);

                let attributeIndex = 0;
                let dyIndex = 0;

                for (let i = 0; i < geometrySpecs.length; i++) {
                  const geometrySpec = geometrySpecs[i];
                  const {positions: newPositions, colors: newColors, dys: newDys} = geometrySpec;

                  positions.set(newPositions, attributeIndex);
                  colors.set(newColors, attributeIndex);
                  dys.set(newDys, dyIndex);

                  attributeIndex += newPositions.length;
                  dyIndex += newDys.length;

                  spriteUtils.releaseSpriteGeometry(geometrySpec);
                }

                geometry.addAttribute('position', new THREE.BufferAttribute(positions.subarray(0, attributeIndex), 3));
                geometry.addAttribute('color', new THREE.BufferAttribute(colors.subarray(0, attributeIndex), 3));
                geometry.addAttribute('dy', new THREE.BufferAttribute(dys.subarray(0, dyIndex), 2));

                next();
              })
              .catch(err => {
                console.warn(err);

                next();
              });
          });
          _renderAssets();
          mesh.render = _renderAssets;
          return mesh;
        })();
        menuMesh.add(assetsMesh);

        let animation = null;
        const _openMenu = () => {
          const {hmd: hmdStatus} = webvr.getStatus();
          const {worldPosition: hmdPosition, worldRotation: hmdRotation} = hmdStatus;

          const newMenuRotation = (() => {
            const hmdEuler = new THREE.Euler().setFromQuaternion(hmdRotation, camera.rotation.order);
            hmdEuler.x = 0;
            hmdEuler.z = 0;
            return new THREE.Quaternion().setFromEuler(hmdEuler);
          })();
          const newMenuPosition = hmdPosition.clone()
            .add(new THREE.Vector3(0, 0, -1.5).applyQuaternion(newMenuRotation));
          const newMenuScale = new THREE.Vector3(1, 1, 1);
          menuMesh.position.copy(newMenuPosition);
          menuMesh.quaternion.copy(newMenuRotation);
          menuMesh.scale.copy(newMenuScale);
          // menuMesh.visible = true;
          menuMesh.updateMatrixWorld();

          menuState.open = true;
          /* menuState.position.copy(newMenuPosition);
          menuState.rotation.copy(newMenuRotation);
          menuState.scale.copy(newMenuScale); */
          plane.open = true;
          planeLeft.open = true;
          planeRight.open = true;

          planeMeshLeft.render();
          planeLeft.updateAnchors();
          planeMeshRight.render();
          planeRight.updateAnchors();

          sfx.digi_slide.trigger();

          animation = anima.makeAnimation(0, 1, 1000);
        };
        const _closeMenu = () => {
          // menuMesh.visible = false;

          menuState.open = false;
          plane.open = false;
          planeLeft.open = false;
          planeRight.open = false;

          sfx.digi_powerdown.trigger();

          animation = anima.makeAnimation(1, 0, 1000);
        };
        const _menudown2 = () => {
          const {open} = menuState;

          if (open) {
            _closeMenu();
          } else {
            _openMenu();
          }
        };
        input.on('menudown', _menudown2);

        const _triggerdown = e => {
          const {side} = e;
          const hoverState = uiTracker.getHoverState(side);
          const {anchor} = hoverState;
          if (anchor) {
            anchor.triggerdown(e, hoverState);
          }
        };
        input.on('triggerdown', _triggerdown);
        const _triggerup = e => {
          onmove = null;
        };
        input.on('triggerup', _triggerup);

        const _trigger = e => {
          const {side} = e;

          if (menuState.open) {
            sfx.digi_plink.trigger();

            e.stopImmediatePropagation();
          }
        };
        input.on('trigger', _trigger, {
          priority: -1,
        });

        const _isItemHovered = side => {
          const assetPosition = localVector.copy(zeroVector)
            .applyMatrix4(
              localMatrix.compose(
                localVector2.set(
                  WORLD_WIDTH / 2 - pixelSize * 16 - pixelSize * 16*0.75,
                  -WORLD_HEIGHT / 2 + pixelSize * 16,
                  pixelSize * 16/2
                ),
                zeroQuaternion,
                oneVector
              ).premultiply(assetsMesh.matrixWorld)
            );
          const {gamepads} = webvr.getStatus();
          const gamepad = gamepads[side];
          const distance = assetPosition.distanceTo(gamepad.worldPosition);
          return distance < pixelSize*16/2;
        };
        /* const _gripdown = e => {
          const {side} = e;

          const _handlePlaneMeshes = () => {
            const {gamepads} = webvr.getStatus();
            const gamepad = gamepads[side];

            for (const id in planeMeshes) {
              const planeMesh = planeMeshes[id];

              if (planeMesh && planeMesh.position.distanceTo(gamepad.worldPosition) < ITEM_MENU_WORLD_SIZE) {
                const {grabbable} = planeMesh;

                grabbable.setOpen(false);
                grabbable.show();
                grabbable.grab(side);

                return true;
              }
            }
            return false;
          };
          const _handleMod = () => {
            if (localMod && localMod.metadata && localMod.metadata.items && Array.isArray(localMod.metadata.items) && localMod.metadata.items.length > 0 && _isItemHovered(side)) {
              const attributes = (() => {
                const itemSpec = localMod.metadata.items[0];
                const {attributes} = itemSpec;

                const result = {};
                for (const attributeName in attributes) {
                  const attributeSpec = attributes[attributeName];
                  const {value} = attributeSpec;
                  result[attributeName] = {value};
                }
                return result;
              })();
              const itemSpec = {
                assetId: _makeId(),
                id: _makeId(),
                name: 'new-item',
                ext: 'itm',
                json: {
                  data: {
                    path: localMod.displayName + '/' + localMod.metadata.items[0].type,
                    attributes,
                    icon: localImage,
                  },
                },
              };
              wallet.pullItem(itemSpec, side);

              return true;
            } else {
              return false;
            }
          };
          const _handleFile = () => {
            if (localAsset && _isItemHovered(side)) {
              wallet.pullItem(localAsset, side);

              e.stopImmediatePropagation();

              return true;
            } else {
              return false;
            }
          };

          _handlePlaneMeshes() || _handleMod() || _handleFile();
        };
        input.on('gripdown', _gripdown); */

        const _grab = e => {
          const targets = focusState.type === 'grab' ? focusState.targets : {
            left: null,
            right: null,
          };
          targets[e.side] = e.grabbable;

          _setFocus({
            type: 'grab',
            targets,
          });
        };
        hand.on('grab', _grab);
        const _release = e => {
          const targets = {
            left: focusState.targets.left,
            right: focusState.targets.right,
          };
          targets[e.side] = null;
          if (targets.left || targets.right) {
            _setFocus({
              type: 'grab',
              targets,
            });
          } else {
            _setFocus({});
          }
        };
        hand.on('release', _release);

        cleanups.push(() => {
          scene.remove(menuMesh);

          for (let i = 0; i < SIDES.length; i++) {
            const side = SIDES[i];
            scene.remove(uiTracker.dotMeshes[side]);
            scene.remove(uiTracker.boxMeshes[side]);
          }

          world.removeListener('add', _worldAdd);
          wallet.removeListener('assets', _walletAssets);
          /* wallet.removeListener('menuopen', _walletMenuOpen);
          wallet.removeListener('menuclose', _walletMenuClose); */

          // input.removeListener('menudown', _menudown);
          input.removeListener('menudown', _menudown2);
          input.removeListener('triggerdown', _triggerdown);
          // input.removeListener('triggerup', _triggerup);
          input.removeListener('triggerup', _trigger);
          // input.removeListener('gripdown', _gripdown);
          hand.removeListener('grab', _grab);
          hand.removeListener('release', _release);

          scene.onRenderEye = null;
          scene.onBeforeRenderEye = null;
          scene.onAfterRenderEye = null;
        });

        rend.on('update', () => {
          const _updateMove = () => {
            if (onmove) {
              onmove();
            }
          };
          const _updateMenu = () => {
            if (menuState.open) {
              if (menuMesh.position.distanceTo(webvr.getStatus().hmd.worldPosition) > MENU_RANGE) {
                _closeMenu();
              }
            }
          };
          const _updateUiTracker = () => {
            uiTracker.update({
              pose: webvr.getStatus(),
              sides: (() => {
                const vrMode = bootstrap.getVrMode();

                if (vrMode === 'hmd') {
                  return SIDES;
                } else {
                  const mode = webvr.getMode();

                  if (mode !== 'center') {
                    return [mode];
                  } else {
                    return SIDES;
                  }
                }
              })(),
              controllerMeshes: rend.getAuxObject('controllerMeshes'),
            });

            /* const {gamepads} = webvr.getStatus();
            const {boxMeshes} = uiTracker;
            for (let i = 0; i < SIDES.length; i++) {
              const side = SIDES[i];
              const gamepad = gamepads[side];
              const boxMesh = boxMeshes[side];

              for (const id in planeMeshes) {
                const planeMesh = planeMeshes[id];

                if (planeMesh && planeMesh.position.distanceTo(gamepad.worldPosition) < ITEM_MENU_WORLD_SIZE) {
                  boxMesh.position.copy(planeMesh.position);
                  boxMesh.quaternion.copy(zeroQuaternion);
                  boxMesh.scale.set(ITEM_MENU_WORLD_SIZE, ITEM_MENU_WORLD_SIZE, ITEM_MENU_WORLD_SIZE);
                  boxMesh.updateMatrixWorld();
                  boxMesh.visible = true;
                  break;
                }
              }
            } */
          };
          const _updateAnimation = () => {
            if (animation) {
              if (animation.isDone()) {
                menuMesh.visible = animation.getValue() >= 0.5;
                animation = null;
              } else {
                const value = animation.getValue();
                if (value > 0) {
                  planeMesh.scale.set(1, value, 1);
                  planeMesh.updateMatrixWorld();

                  planeMeshLeft.scale.set(1, value, 1);
                  planeMeshLeft.updateMatrixWorld();

                  planeMeshRight.scale.set(1, value, 1);
                  planeMeshRight.updateMatrixWorld();

                  assetsMesh.scale.set(1, value, 1);
                  assetsMesh.updateMatrixWorld();

                  // lensMesh.scale.set(value, value, value);
                  // lensMesh.updateMatrixWorld();
                  // lensMesh.planeMesh.material.uniforms.opacity.value = value;

                  menuMesh.visible = true;
                } else {
                  menuMesh.visible = false;
                }
              }
            }
          };

          _updateMove();
          _updateMenu();
          _updateUiTracker();
          _updateAnimation();
        });
        /* rend.on('updateEye', eyeCamera => {
          if (menuMesh.visible) {
            lensMesh.planeMesh.visible = false;
            lensMesh.render(scene, eyeCamera);
            lensMesh.planeMesh.visible = true;
          }
        }); */
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}
const _clone = o => {
  const result = {};
  for (const k in o) {
    result[k] = o[k];
  }
  return result;
};
const _arrayify = (array, numElements) => {
  array = array || [];

  const result = Array(numElements);
  for (let i = 0; i < numElements; i++) {
    result[i] = array[i] || null;
  }
  return result;
};
const _makeId = () => Math.random().toString(36).substring(7);
/* const _makeTagName = s => {
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/(?:^-|-$)/g, '');
  if (/^[0-9]/.test(s)) {
    s = 'e-' + s;
  }
  if (htmlTagNames.includes(s)) {
    s = 'e-' + s;
  }
  return s;
}; */
const _roundToDecimals = (value, decimals) => Number(Math.round(value+'e'+decimals)+'e-'+decimals);
const _debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

module.exports = Inventory;
