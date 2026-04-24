import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const REGION      = process.env.AWS_REGION || 'us-west-2';
const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET || 'xrestaurant-media-728560460807';

const s3 = new S3Client({ region: REGION });

/**
 * Upload an image buffer to S3.
 * Drop-in replacement for uploadImageCloudinary —
 * same call signature, same return shape: { success, data: { url } }
 *
 * @param {Express.Multer.File} image  - multer file object (has .buffer, .mimetype, .originalname)
 * @param {string} folder              - S3 "folder" prefix (default: "uploads")
 */
const uploadImageS3 = async (image, folder = 'uploads') => {
    try {
        const buffer   = image?.buffer || Buffer.from(await image.arrayBuffer());
        const mimeType = image?.mimetype || 'image/jpeg';
        const ext      = (image?.originalname || 'image.jpg').split('.').pop();
        const key      = `${folder}/${randomUUID()}.${ext}`;

        await s3.send(new PutObjectCommand({
            Bucket:      MEDIA_BUCKET,
            Key:         key,
            Body:        buffer,
            ContentType: mimeType,
        }));

        const url = `https://${MEDIA_BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

        return {
            success: true,
            data: { url, key, bucket: MEDIA_BUCKET }
        };
    } catch (error) {
        console.error('S3 upload error:', error);
        return {
            success: false,
            error: error.message || 'Lỗi khi tải ảnh lên S3'
        };
    }
};

export default uploadImageS3;
