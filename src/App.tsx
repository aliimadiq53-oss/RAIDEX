import { RouterProvider } from 'react-router'
import { router } from './routes'

/* Re-export site settings types so existing imports still work */
export type { SiteSettings, HeroSlide, GalleryImage, ChampionEntry, NewsItem, SponsorEntry } from './context/AppContext'

export default function App() {
  return <RouterProvider router={router} />
}
