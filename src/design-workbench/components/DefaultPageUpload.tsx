import { useLocale } from '../LocaleContext';
import { Icon } from './ui';

// Figma default 1:9567 / hover 1:9695 — DesignWorkspace/DefaultPageUpload (5.1 Beta).
// The first three positions describe rotated bounding boxes, not the cards themselves.
export function DefaultPageUpload({ dragging, onUpload }: { dragging: boolean; onUpload: () => void }) {
  const { t } = useLocale();
  return <button className={`upload-zone ${dragging ? 'dragover' : ''}`} onClick={onUpload} aria-label={t("上传线稿图、款式图、图案或面料图")} data-node-id="1:9567">
    <span className="collage" aria-hidden="true">
      <span className="sample-position sample-sketch"><span className="sample-card"><img src="/assets/design-workbench/sketch.png" alt="" draggable={false} /></span></span>
      <span className="sample-position sample-garment"><span className="sample-card"><img src="/assets/design-workbench/garment.jpg" alt="" draggable={false} /></span></span>
      <span className="sample-position sample-pattern"><span className="sample-card"><img src="/assets/design-workbench/pattern.png" alt="" draggable={false} /></span></span>
      <span className="sample-position sample-fabric"><span className="sample-card"><img src="/assets/design-workbench/fabric.png" alt="" draggable={false} /></span></span>
    </span>
    <span className="upload-hover-overlay" data-node-id="1:9695">
      <span className="upload-hover-content">
        <Icon name="upload-add-image" size={48} />
        <span className="upload-hover-copy">
          <strong>{dragging ? t("松开即可上传图片") : t("点击、拖放上传图片，或者直接和AI聊一聊")}</strong>
          <span>{t("支持jpg、jpeg、png、webp、svg格式图片,最大支持20M以内图片")}</span>
        </span>
      </span>
    </span>
  </button>;
}
