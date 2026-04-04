from PyQt5.QtCore import QObject, pyqtSignal


class InferenceSession(QObject):
    sig_log = pyqtSignal(str)
    sig_progress = pyqtSignal(int)
    sig_status = pyqtSignal(str)
    sig_finished = pyqtSignal()
    sig_error = pyqtSignal(str)

    def __init__(self, location_code, footage_path, config_path, output_root, g_proj_path, config_name=None):
        super().__init__()
        self.loc_code = location_code
        self.footage_path = footage_path
        self.config_path = config_path
        # config_name is the selected key inside a multi-config YAML
        self.config_name = config_name
        self.output_root = output_root
        self.g_proj_path = g_proj_path
        self.stop_requested = False

        self._pipeline_cls = None
        self._pipeline_import_error = None
        try:
            # Import in the GUI/main thread before the worker is moved to QThread.
            # On Windows, importing torch from a QThread can fail with WinError 1114.
            from trafficlab.inference.pipeline import InferencePipeline
            self._pipeline_cls = InferencePipeline
        except Exception as e:
            self._pipeline_import_error = e

    def request_stop(self):
        self.stop_requested = True

    def run(self):
        try:
            if self._pipeline_import_error is not None or self._pipeline_cls is None:
                raise RuntimeError(
                    f"Failed to initialize inference pipeline: {self._pipeline_import_error}"
                )

            pipeline = self._pipeline_cls(
                location_code=self.loc_code,
                footage_path=self.footage_path,
                config_path=self.config_path,
                output_root=self.output_root,
                g_proj_path=self.g_proj_path,
                config_name=self.config_name,
                log_fn=self.sig_log.emit,
                progress_fn=self.sig_progress.emit,
                stop_flag_fn=lambda: self.stop_requested
            )
            pipeline.run()
        except Exception as e:
            import traceback
            err_msg = f"Pipeline Error: {str(e)}\n{traceback.format_exc()}"
            self.sig_log.emit(err_msg)
            self.sig_error.emit(err_msg)
        finally:
            self.sig_finished.emit()

        self.sig_log.emit("Done.")