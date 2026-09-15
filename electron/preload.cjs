const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("skilldock", {
  call: async (method, args) => {
    const result = await ipcRenderer.invoke("skilldock:call", method, args);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
});
