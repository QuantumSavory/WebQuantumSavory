const generateUUid = function ( prefix = '', length = 6 ) {
  // 0-9a-zA-Z
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  result = prefix ? prefix + '_' + result : result;
  return result;
}

function setEdgeCorrectNodeOrder(edge, nodeList){
  const sourceNodeIndex = nodeList.findIndex(n => n.id === edge.source.id)
  const targetNodeIndex = nodeList.findIndex(n => n.id === edge.target.id)
  const previousSource = edge.source;
  const previousTarget = edge.target;
  if (sourceNodeIndex > targetNodeIndex) {
    edge.source = previousTarget;
    edge.target = previousSource;
  }
}
export { generateUUid, setEdgeCorrectNodeOrder };