import { IPackageInfo, IInstallResultData } from '@/interfaces';
import { ipcRenderer } from 'electron';

export default {
  state: {
    basePackagesList: [],
    isInstalling: false,
    uninstalledPackagesList: [],
    selectedInstalledPackagesList: [],
    currentStep: 0,
    pkgInstallStep: 0,
    pkgInstallStatuses: [],
    installResult: [],
  },
  reducers: {
    updateBasePackagesList(prevState, basePackagesList: IPackageInfo[]) {
      prevState.basePackagesList = basePackagesList;
    },

    updateInstallStatus(prevState, isInstalling: boolean) {
      prevState.isInstalling = isInstalling;
    },

    updateUninstalledPackagesList(prevState, uninstalledPackagesList: IPackageInfo[]) {
      prevState.uninstalledPackagesList = uninstalledPackagesList;
    },

    updateCurrentStep(prevState, step: number) {
      prevState.currentStep = step;
    },

    updatePkgInstallStep(prevState, step: number) {
      prevState.pkgInstallStep = step;
    },

    updatePkgInstallStepStatus(prevState, { step, status }) {
      prevState.pkgInstallStatuses[step].status = status;
    },

    initStep(prevState, selectedInstalledPackagesList: IPackageInfo[]) {
      // skip the start step
      prevState.currentStep = 1;
      prevState.pkgInstallStep = 0;
      prevState.pkgInstallStatuses = selectedInstalledPackagesList.map((item: IPackageInfo) => ({ name: item.name, status: 'wait' }));
      prevState.selectedInstalledPackagesList = selectedInstalledPackagesList;
      prevState.installResult = [];
    },

    updateInstallResult(prevState, installResult: IInstallResultData[]) {
      prevState.installResult = installResult;
    },
  },
  effects: (dispatch) => ({
    async getBasePackages() {
      const data = await ipcRenderer.invoke('get-base-packages-info');
      dispatch.dashboard.updateBasePackagesList(data);
      const packagesList = data.filter((basePackage: IPackageInfo) => {
        return basePackage.versionStatus !== 'installed';
      });
      dispatch.dashboard.updateUninstalledPackagesList(packagesList);
    },

    async clearCaches({ processChannel, installChannel }) {
      await ipcRenderer.invoke('clear-base-packages-install-cache', { processChannel, installChannel });
    },

    async getCaches({ processChannel, installChannel }) {
      // TODO: handle install log cache
      const { processCaches } = await ipcRenderer.invoke(
        'get-node-install-cache',
        { processChannel, installChannel },
      );

      if (Array.isArray(processCaches)) {
        processCaches.forEach(({ currentIndex, status, result }) => {
          if (status === 'done') {
            dispatch.dashboard.updateCurrentStep(2);
            dispatch.dashboard.updateInstallResult(result);
          } else {
            dispatch.dashboard.updatePkgInstallStepStatus({ status, step: currentIndex });
          }
        });
      }
    },
  }),
};