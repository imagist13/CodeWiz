import Image from 'next/image';

export function NavTitle() {
  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt="CodePilot"
        width={24}
        height={24}
        className="h-6 w-6"
      />
      <span className="text-[15px] font-bold">CodePilot</span>
    </span>
  );
}
