import React from 'react';
import { Button, Result } from 'antd';

interface PanelErrorBoundaryProps {
  children: React.ReactNode;
  panelName: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[${this.props.panelName}] 面板渲染失败`, error, errorInfo.componentStack);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    const { children, panelName } = this.props;
    const { hasError, error } = this.state;

    if (hasError) {
      return (
        <Result
          status="warning"
          title="面板加载出错"
          subTitle={`${panelName}：${error?.message ?? '未知错误'}`}
          extra={
            <Button type="primary" onClick={this.handleRetry}>
              重试
            </Button>
          }
        />
      );
    }

    return children;
  }
}
