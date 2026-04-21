// ============================================================================
// S3 Media Routes - List and serve images/documents from S3
// ============================================================================

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ 
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const MEDIA_BUCKET = 'xrestaurant-media-905418484418';
const DOCS_BUCKET = 'xrestaurant-documents-905418484418';

/**
 * List all images in media bucket
 */
export const listImages = async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: MEDIA_BUCKET
        });

        const response = await s3Client.send(command);
        
        const images = (response.Contents || []).map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            url: `https://${MEDIA_BUCKET}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${item.Key}`
        }));

        res.json({
            success: true,
            bucket: MEDIA_BUCKET,
            count: images.length,
            images: images,
            user: req.user?.username
        });
    } catch (error) {
        console.error('Error listing images:', error);
        res.status(500).json({
            error: 'Failed to list images',
            message: error.message
        });
    }
};

/**
 * List all documents in documents bucket
 */
export const listDocuments = async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: DOCS_BUCKET
        });

        const response = await s3Client.send(command);
        
        const documents = (response.Contents || []).map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            filename: item.Key.split('/').pop()
        }));

        res.json({
            success: true,
            bucket: DOCS_BUCKET,
            count: documents.length,
            documents: documents,
            user: req.user?.username,
            note: 'Use /api/s3/documents/:key/download to get signed URL'
        });
    } catch (error) {
        console.error('Error listing documents:', error);
        res.status(500).json({
            error: 'Failed to list documents',
            message: error.message
        });
    }
};

/**
 * Get signed URL for document download
 * Only authenticated users can download
 */
export const getDocumentSignedUrl = async (req, res) => {
    try {
        const { key } = req.params;
        
        // Generate signed URL (valid for 1 hour)
        const command = new GetObjectCommand({
            Bucket: DOCS_BUCKET,
            Key: key
        });

        const signedUrl = await getSignedUrl(s3Client, command, { 
            expiresIn: 3600 // 1 hour
        });

        res.json({
            success: true,
            key: key,
            signedUrl: signedUrl,
            expiresIn: 3600,
            user: req.user?.username,
            message: 'Use this URL to download the file (valid for 1 hour)'
        });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({
            error: 'Failed to generate signed URL',
            message: error.message
        });
    }
};

/**
 * Get image by key (public access)
 */
export const getImageUrl = async (req, res) => {
    try {
        const { key } = req.params;
        
        const url = `https://${MEDIA_BUCKET}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`;

        res.json({
            success: true,
            key: key,
            url: url,
            bucket: MEDIA_BUCKET,
            message: 'This is a public URL, you can access it directly'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get image URL',
            message: error.message
        });
    }
};
