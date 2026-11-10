"use client";
import { Card } from "@/components/ui/card";

interface MyAppProps {
  children: React.ReactNode;
  className?: string;
}
const CardBox: React.FC<MyAppProps> = ({ children, className }) => {
  return (
    <Card className={`card rounded-xl border border-border shadow-2xs ${className ?? ""}`}>
      {children}
    </Card>
  );
};

export default CardBox;
