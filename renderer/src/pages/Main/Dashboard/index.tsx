import { useEffect, useState } from 'react';
import { Button, Grid, Step, Message, Loading, Balloon, Icon } from '@alifd/next';
import { ipcRenderer, IpcRendererEvent } from 'electron';
import classnames from 'classnames';
import PageHeader from '@/components/PageHeader';
import XtermTerminal from '@/components/XtermTerminal';
import xtermManager from '@/utils/xtermManager';
import { PackageInfo, VersionStatus } from '@/types/base';
import { STEP_STATUS_ICON } from '@/constants';
import AppCard from '@/components/AppCard';
import InstallConfirmDialog from './components/InstallConfirmDialog';
import InstallResult from './components/InstallResult';
import styles from './index.module.scss';
import store from '@/pages/Main/store';
import PackageDetail from './components/PackageDetail';

const { Row, Col } = Grid;

const TERM_ID = 'dashboard';
const INSTALL_PACKAGE_CHANNEL = 'install-base-package';
const INSTALL_PROCESS_STATUS_CHANNEL = 'install-base-package-process-status';

const Dashboard = () => {
  const [dialogVisible, setDialogVisible] = useState(false);

  const [state, dispatchers] = store.useModel('dashboard');
  const effectsState = store.useModelEffectsState('dashboard');
  const {
    basePackagesList,
    isInstalling,
    uninstalledPackagesList,
    selectedInstalledPackagesList,
    pkgInstallStatuses,
    pkgInstallStep,
    currentStep,
    installResult,
    packageDetailVisible,
  } = state;

  const writeChunk = (
    e: IpcRendererEvent,
    data: { chunk: string; ln?: boolean },
  ) => {
    const { chunk, ln } = data;
    const xterm = xtermManager.getTerm(TERM_ID);
    if (xterm) {
      xterm.writeChunk(chunk, ln);
    }
  };

  async function onDialogConfirm(packageNames: string[]) {
    onDialogClose();
    if (!packageNames.length) {
      return;
    }
    const packagesList = uninstalledPackagesList.filter((item) => {
      return packageNames.includes(item.id);
    });

    const xterm = xtermManager.getTerm(TERM_ID);
    if (xterm) {
      xterm.clear(TERM_ID);
    }
    // init install state
    await dispatchers.clearCaches({ installChannel: INSTALL_PACKAGE_CHANNEL, processChannel: INSTALL_PROCESS_STATUS_CHANNEL });
    dispatchers.updateInstallStatus(true);
    dispatchers.initStep(packagesList);

    await installPackages(packagesList);
  }

  async function installPackages(packagesList: PackageInfo[]) {
    ipcRenderer
      .invoke('install-base-packages', {
        packagesList,
        installChannel: INSTALL_PACKAGE_CHANNEL,
        processChannel: INSTALL_PROCESS_STATUS_CHANNEL,
      })
      .catch((error) => {
        Message.error(error.message);
      });
  }

  const showDetailPage = (packageInfo: PackageInfo) => {
    dispatchers.setPackageDetailVisible(true);
    dispatchers.setCurrentPackageInfo(packageInfo);
  };

  function onDialogOpen() { setDialogVisible(true); }

  function onDialogClose() { setDialogVisible(false); }

  function goBackFromInstallPage() {
    dispatchers.updateInstallStatus(false);
    dispatchers.getBasePackages(true);
  }

  async function handleCancelInstall() {
    await dispatchers.clearCaches({ installChannel: INSTALL_PACKAGE_CHANNEL, processChannel: INSTALL_PROCESS_STATUS_CHANNEL });
    await ipcRenderer.invoke('cancel-install-base-packages', INSTALL_PACKAGE_CHANNEL);
    goBackFromInstallPage();
  }

  useEffect(() => {
    if (!isInstalling) {
      dispatchers.getBasePackages();
    }
  }, []);

  useEffect(() => {
    if (isInstalling) {
      dispatchers.getCaches({ installChannel: INSTALL_PACKAGE_CHANNEL, processChannel: INSTALL_PROCESS_STATUS_CHANNEL });
    }
  }, []);

  useEffect(() => {
    ipcRenderer.on(INSTALL_PACKAGE_CHANNEL, writeChunk);
    return () => {
      ipcRenderer.removeListener(INSTALL_PACKAGE_CHANNEL, writeChunk);
    };
  }, []);

  useEffect(() => {
    function handleUpdateInstallStatus(e: IpcRendererEvent, { currentIndex, status, result, id }) {
      const { dashboard } = store.getState();
      if (status === 'done') {
        dispatchers.updateCurrentStep((dashboard.currentStep as number) + 1);
        dispatchers.updateInstallResult(result);
        return;
      }

      if ((dashboard.currentPackageInfo as PackageInfo).id === id && status === 'finish') {
        const newCurrentPackageInfo = { ...dashboard.currentPackageInfo as PackageInfo, versionStatus: 'installed' };
        dispatchers.setCurrentPackageInfo(newCurrentPackageInfo);
        return;
      }
      dispatchers.updatePkgInstallStep(currentIndex);
      dispatchers.updatePkgInstallStepStatus({ step: currentIndex, status });
    }

    ipcRenderer.on(INSTALL_PROCESS_STATUS_CHANNEL, handleUpdateInstallStatus);
    return () => {
      ipcRenderer.removeListener(
        INSTALL_PROCESS_STATUS_CHANNEL,
        handleUpdateInstallStatus,
      );
    };
  }, []);

  const cancelInstallBtn = currentStep === 2 ? null : (
    <Button type="normal" onClick={handleCancelInstall}>
      取消安装
    </Button>
  );

  const installButton = isInstalling ? cancelInstallBtn : (
    <Button type="primary" onClick={onDialogOpen}>
      一键安装
    </Button>
  );

  const installStepItem = (
    <div className={styles.installStep}>
      <Step current={pkgInstallStep} direction="ver" shape="dot">
        {selectedInstalledPackagesList.map((item: PackageInfo, index: number) => {
          let { status } = pkgInstallStatuses[index] || {};
          if (status === 'downloaded') {
            status = 'process';
          }
          return (
            <Step.Item
              key={item.id}
              title={item.title}
              className={classnames(
                styles.installStepItem,
                { [styles.installSuccess]: status === 'finish', [styles.installError]: status === 'error' },
              )}
              icon={STEP_STATUS_ICON[status]}
            />
          );
        })}
      </Step>
    </div>
  );

  if (packageDetailVisible) {
    return <PackageDetail installPackages={installPackages} />;
  }

  return (
    <>
      <PageHeader
        title="前端开发必备"
        button={uninstalledPackagesList.length ? installButton : null}
      />
      <Loading className={styles.dashboard} visible={effectsState.getBasePackages.isLoading}>
        {isInstalling ? (
          <div className={styles.install}>
            <Row wrap>
              <Col span={6}>
                <Step current={currentStep} direction="ver">
                  <Step.Item title="开始" />
                  <Step.Item
                    title="安装"
                    content={installStepItem}
                  />
                  <Step.Item title="完成" />
                </Step>
              </Col>
              <Col span={18}>
                {(currentStep === 2) ? (
                  <InstallResult
                    goBack={goBackFromInstallPage}
                    result={installResult}
                  />
                ) : (
                  <XtermTerminal id={TERM_ID} name={TERM_ID} height="calc(100vh - 200px)" />
                )}
              </Col>
            </Row>
          </div>
        ) : (
          <Row wrap gutter={8}>
            {basePackagesList.map((item: PackageInfo, index: number) => (
              <Col s={12} l={8} key={item.id}>
                <AppCard
                  {...item}
                  showDetailPage={(item.images || item.intro) ? () => showDetailPage(item) : undefined}
                  operation={
                    <div
                      className={classnames(styles.status, { [styles.uninstalledStatus]: item.versionStatus !== 'installed' })}
                    >
                      {VersionStatus[item.versionStatus]}
                      {item.warningMessage && (
                      <Balloon trigger={<Icon type="warning" />} closable={false}>
                        {item.warningMessage}
                      </Balloon>
                      )}
                    </div>
                  }
                  showSplitLine={basePackagesList.length - (basePackagesList.length % 2 ? 1 : 2) > index}
                />
              </Col>
            ))}
          </Row>
        )}
      </Loading>
      {dialogVisible && (
      <InstallConfirmDialog
        packages={uninstalledPackagesList}
        onCancel={onDialogClose}
        onOk={onDialogConfirm}
      />
      )}
    </>
  );
};

export default () => (
  <store.Provider>
    <Dashboard />
  </store.Provider>
);
