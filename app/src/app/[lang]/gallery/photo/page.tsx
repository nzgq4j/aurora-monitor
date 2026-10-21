import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../../i18n/server';
import { GalleryPhoto } from '../../../../screens/GalleryPhoto';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.galleryPhoto') };
}

export default function Page() {
  return <GalleryPhoto />;
}
