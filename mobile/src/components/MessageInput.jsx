import React, { useState, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  Alert, Platform, Text, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { colors, typography, radii, spacing } from '../theme';
import { api } from '../services/api';

export default function MessageInput({
  onSend,
  replyTo,
  onCancelReply,
  disabled,
  placeholder = 'Message…',
}) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const canSend = text.trim().length > 0 && !uploading;

  const handleSend = () => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend({ type: 'text', content: text.trim() });
    setText('');
  };

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow access to your photo library to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.AUTOMATIC,
    });

    if (result.canceled || !result.assets?.length) return;
    uploadMedia(result.assets[0]);
  };

  const handleTakePhoto = async () => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert('Permission required', 'Allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return;
    uploadMedia(result.assets[0]);
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      uploadFile(result.assets[0]);
    } catch (e) {
      Alert.alert('Error', 'Could not pick file');
    }
  };

  async function uploadMedia(asset) {
    setUploading(true);
    try {
      const formData = new FormData();
      const isVideo  = asset.type === 'video';
      const mime     = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
      const ext      = mime.split('/')[1] || 'jpg';
      formData.append('file', {
        uri:  asset.uri,
        type: mime,
        name: asset.fileName || `media.${ext}`,
      });

      const data = await api.uploadFile(formData);
      onSend({
        type:      mime.startsWith('video/') ? 'video' : 'image',
        file_url:  data.url,
        file_name: data.filename,
        file_size: data.size,
        file_mime: mime,
      });
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(asset) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri:  asset.uri,
        type: asset.mimeType || 'application/octet-stream',
        name: asset.name || 'file',
      });

      const data = await api.uploadFile(formData);
      onSend({
        type:      'file',
        file_url:  data.url,
        file_name: data.filename,
        file_size: data.size,
        file_mime: asset.mimeType || 'application/octet-stream',
      });
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      {replyTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyBar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyFrom}>{replyTo.sender_name}</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyTo.content || (replyTo.file_name ? `📎 ${replyTo.file_name}` : 'File')}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleTakePhoto}
          disabled={disabled || uploading}
        >
          <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handlePickImage}
          disabled={disabled || uploading}
        >
          <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handlePickFile}
          disabled={disabled || uploading}
        >
          <Ionicons name="attach-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={uploading ? 'Uploading…' : placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!disabled && !uploading}
        />

        {uploading ? (
          <ActivityIndicator color={colors.primary} style={styles.sendBtn} />
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, canSend && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Ionicons
              name="send"
              size={20}
              color={canSend ? '#fff' : colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : 4,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  replyBar: {
    width: 3,
    height: '100%',
    minHeight: 30,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  replyFrom: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: typography.base,
    color: colors.text,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: colors.primary,
  },
});
