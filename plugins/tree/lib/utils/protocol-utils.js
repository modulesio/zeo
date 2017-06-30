const UINT32_SIZE = 4;
const INT32_SIZE = 4;
const FLOAT32_SIZE = 4;
const UINT16_SIZE = 2;
const TREE_GEOMETRY_HEADER_ENTRIES = 4;
const TREE_GEOMETRY_HEADER_SIZE = UINT32_SIZE * TREE_GEOMETRY_HEADER_ENTRIES;

const _getTreeGeometrySizeFromMetadata = metadata => {
  const {numPositions, numNormals, numColors, numIndices} = metadata;

  return TREE_GEOMETRY_HEADER_SIZE + // header
    (FLOAT32_SIZE * numPositions) + // positions
    (FLOAT32_SIZE * numNormals) +  // normals
    (FLOAT32_SIZE * numColors) + // colors
    (UINT16_SIZE * numIndices); // indices
};

const _getTreeGeometrySize = treeGeometry => {
  const {positions, normals, colors, indices} = treeGeometry;

  const numPositions = positions.length;
  const numNormals = normals.length;
  const numColors = colors.length;
  const numIndices = indices.length;

  return _getTreeGeometrySizeFromMetadata({
    numPositions,
    numNormals,
    numColors,
    numIndices,
  });
};

const _getTreeGeometryBufferSize = (arrayBuffer, byteOffset) => {
  const headerBuffer = new Uint32Array(arrayBuffer, byteOffset, TREE_GEOMETRY_HEADER_ENTRIES);
  const numPositions = headerBuffer[0];
  const numNormals = headerBuffer[1];
  const numColors = headerBuffer[2];
  const numIndices = headerBuffer[3];

  return _getTreeGeometrySizeFromMetadata({
    numPositions,
    numNormals,
    numColors,
    numIndices,
  });
};

// stringification

const stringifyTreeGeometry = (treeGeometry, arrayBuffer, byteOffset) => {
  const {positions, normals, colors, indices} = treeGeometry;

  if (arrayBuffer === undefined || byteOffset === undefined) {
    const bufferSize = _getTreeGeometrySize(treeGeometry);
    arrayBuffer = new ArrayBuffer(bufferSize);
    byteOffset = 0;
  }

  const headerBuffer = new Uint32Array(arrayBuffer, byteOffset, TREE_GEOMETRY_HEADER_ENTRIES);
  headerBuffer[0] = positions.length;
  headerBuffer[1] = normals.length;
  headerBuffer[2] = colors.length;
  headerBuffer[3] = indices.length;

  const positionsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE, positions.length);
  positionsBuffer.set(positions);

  const normalsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * positions.length), normals.length);
  normalsBuffer.set(normals);

  const colorsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * positions.length) + (FLOAT32_SIZE * normals.length), colors.length);
  colorsBuffer.set(colors);

  const indicesBuffer = new Uint16Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * positions.length) + (FLOAT32_SIZE * normals.length) + (FLOAT32_SIZE * colors.length), indices.length);
  indicesBuffer.set(indices);

  return arrayBuffer;
};

const _sum = a => {
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    const e = a[i];
    result += e;
  }
  return result;
};

const stringifyTreeGeometries = treeGeometrys => {
  const treeGeometrySizes = treeGeometrys.map(_getTreeGeometrySize);
  const bufferSize = _sum(treeGeometrySizes);
  const arrayBuffer = new ArrayBuffer(bufferSize);

  let byteOffset = 0;
  for (let i = 0; i < treeGeometrys.length; i++) {
    const treeGeometry = treeGeometrys[i];

    stringifyTreeGeometry(treeGeometry, arrayBuffer, byteOffset);

    const treeGeometrySize = treeGeometrySizes[i];
    byteOffset += treeGeometrySize;
  }

  return arrayBuffer;
};

// parsing

const parseTreeGeometry = (arrayBuffer, byteOffset) => {
  if (byteOffset === undefined) {
    byteOffset = 0;
  }

  const headerBuffer = new Uint32Array(arrayBuffer, byteOffset, TREE_GEOMETRY_HEADER_ENTRIES);
  const numPositions = headerBuffer[0];
  const numNormals = headerBuffer[1];
  const numColors = headerBuffer[2];
  const numIndices = headerBuffer[3];

  const positionsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE, numPositions);
  const positions = positionsBuffer;

  const normalsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * numPositions), numNormals);
  const normals = normalsBuffer;

  const colorsBuffer = new Float32Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * numPositions) + (FLOAT32_SIZE * numNormals), numColors);
  const colors = colorsBuffer;

  const indicesBuffer = new Uint16Array(arrayBuffer, byteOffset + TREE_GEOMETRY_HEADER_SIZE + (FLOAT32_SIZE * numPositions) + (FLOAT32_SIZE * numNormals) + (FLOAT32_SIZE * numColors), numIndices);
  const indices = indicesBuffer;

  return {
    positions,
    normals,
    colors,
    indices
  };
};

const parseTreeGeometries = arrayBuffer => {
  const treeGeometries = [];

  let byteOffset = 0;
  while (byteOffset < arrayBuffer.byteLength) {
    const treeGeometry = parseTreeGeometry(arrayBuffer, byteOffset);
    treeGeometries.push(treeGeometry);

    const treeGeometrySize = _getTreeGeometryBufferSize(arrayBuffer, byteOffset);
    byteOffset += treeGeometrySize;
  }

  return treeGeometrys;
};

module.exports = {
  stringifyTreeGeometry,
  stringifyTreeGeometries,
  parseTreeGeometry,
  parseTreeGeometries,
};
