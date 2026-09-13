"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import * as yup from "yup";

// react state plus yup, no form library. validates the whole schema on submit
// and clears a field's error as soon as they start fixing it. onSubmit gets the
// validated values, so things like the lowercased email are already applied

type Errors<T> = Partial<Record<keyof T, string>>;

interface UseYupFormOptions<T> {
  schema: yup.ObjectSchema<yup.AnyObject>;
  initialValues: T;
  onSubmit: (values: T) => Promise<void> | void;
}

export function useYupForm<T extends Record<string, string>>({
  schema,
  initialValues,
  onSubmit,
}: UseYupFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Errors<T>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setValues((previousValues) => ({ ...previousValues, [name]: value }));
    // only touch state if there's actually an error to clear, otherwise typing in
    // a clean field re-renders on every keystroke
    setErrors((previousErrors) =>
      previousErrors[name as keyof T] ? { ...previousErrors, [name]: undefined } : previousErrors,
    );
  }

  function setFieldValue(name: keyof T, value: string) {
    setValues((previousValues) => ({ ...previousValues, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    let validatedValues: T;
    try {
      validatedValues = (await schema.validate(values, {
        abortEarly: false,
        stripUnknown: true,
      })) as T;
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        const fieldErrors: Errors<T> = {};
        // first error per field only, three complaints about one input is noise
        for (const issue of validationError.inner) {
          const fieldName = issue.path as keyof T | undefined;
          if (fieldName && !fieldErrors[fieldName]) fieldErrors[fieldName] = issue.message;
        }
        setErrors(fieldErrors);
      }
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit(validatedValues);
    } finally {
      setIsSubmitting(false);
    }
  }

  return { values, errors, isSubmitting, handleChange, setFieldValue, handleSubmit };
}
