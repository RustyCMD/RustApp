interface Props {
  height?: number | string;
  width?: number | string;
  rounded?: number;
  style?: React.CSSProperties;
}

export default function Skeleton({ height = 16, width = "100%", rounded = 6, style }: Props) {
  return (
    <span
      className="skeleton"
      style={{
        height,
        width,
        borderRadius: rounded,
        display: "inline-block",
        ...style,
      }}
    />
  );
}
