import { Breadcrumb, Space, Typography } from "antd";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: { title: string; href?: string }[];
  extra?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({ title, subtitle, breadcrumbs, extra, children }: Props) {
  return (
    <div style={{ marginBottom: 16 }}>
      {breadcrumbs?.length ? (
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={breadcrumbs.map((b) => ({ title: b.title, href: b.href }))}
        />
      ) : null}
      <Space style={{ width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {subtitle ? (
            typeof subtitle === "string" ? (
              <Typography.Text type="secondary">{subtitle}</Typography.Text>
            ) : (
              subtitle
            )
          ) : null}
        </div>
        {extra}
      </Space>
      {children}
    </div>
  );
}
