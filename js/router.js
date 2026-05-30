// Hash-based SPA router
const Router = (() => {
  const routes = {};
  let currentPath = null;

  function register(pattern, handler) {
    routes[pattern] = handler;
  }

  function match(path) {
    for (const pattern of Object.keys(routes)) {
      const regexStr = pattern.replace(/:([^/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${regexStr}$`);
      const m = path.match(regex);
      if (m) return { handler: routes[pattern], params: m.groups || {} };
    }
    return null;
  }

  function navigate(path) {
    window.location.hash = '#' + path;
  }

  function dispatch() {
    const path = window.location.hash.replace(/^#/, '') || '/data';
    if (path === currentPath) return;
    currentPath = path;
    const result = match(path);
    if (result) {
      result.handler(result.params);
    } else {
      navigate('/data');
    }
  }

  window.addEventListener('hashchange', dispatch);
  window.addEventListener('load', dispatch);

  return { register, navigate, dispatch };
})();
