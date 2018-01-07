window.addEventListener('message', e => {
  const {data} = e;

  if (data._api) {
    const {id, method} = data;

    if (method === 'getItems') {
      const localAssetsString = localStorage.getItem('assets');
      if (localAssetsString) {
        const items = JSON.parse(localAssetsString);

        window.parent.postMessage({
          _api: true,
          id,
          result: items,
        }, '*');
      } else {
        window.parent.postMessage({
          _api: true,
          id,
          type: 'response',
          result: [],
        }, '*');
      }
    } else if (method === 'setItems') {
      const {args: {items}} = data;
      localStorage.setItem('assets', []);

      window.parent.postMessage({
        _api: true,
        type: 'response',
        id,
        result: null,
      }, '*');
    }
  }
});

parent.postMessage({
  _api: true,
  type: 'init',
}, '*');
