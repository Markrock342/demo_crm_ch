import { Empty, Result, Spin } from "antd";
import type { ReactNode } from "react";

type EmptyProps = { description?: string; action?: ReactNode };

export function EmptyState({ description, action }: EmptyProps) {
  return <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE}>{action}</Empty>;
}

export function LoadingState({ tip }: { tip?: string }) {
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <Spin tip={tip} />
    </div>
  );
}

export function ErrorState({ title, subTitle }: { title?: string; subTitle?: string }) {
  return <Result status="error" title={title ?? "Error"} subTitle={subTitle} />;
}
