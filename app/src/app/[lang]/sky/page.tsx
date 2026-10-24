import { redirect } from 'next/navigation';

/** Sky view (the camera) is paused for now; old links and the installed app's history land on the gallery. */
export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(`/${lang}/gallery`);
}
